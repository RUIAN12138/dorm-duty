import { createServer } from "../frontend/node_modules/vite/dist/node/index.js";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const vite = await createServer({
  root: process.cwd() + "/frontend",
  server: { port: 8095, strictPort: true },
  configFile: false,
});
await vite.listen();
const b = await (engine === "webkit" ? webkit : chromium).launch({
  headless: true,
  ...(engine === "chromium"
    ? {
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }
    : {}),
});
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
try {
  await p.route("http://localhost:8095/", (r) =>
    r.fulfill({ contentType: "text/html", body: "<html><body></body></html>" }),
  );
  await p.goto("http://localhost:8095/");
  await p.setContent(
    '<style>body{margin:0;background:white;font:16px system-ui}nav{position:absolute;bottom:24px;left:16px;width:358px;height:68px;border-radius:40px;background:#ffffff60;box-shadow:0 0 0 1px #ddd;display:flex;align-items:center;justify-content:space-around}span{position:relative;z-index:1}</style><canvas id="scene" width="358" height="68" style="position:absolute;bottom:24px;left:16px"></canvas><nav><span>值日</span><span>抬水</span><span>日历</span></nav>',
  );
  const metrics = await p.evaluate(async () => {
    const c = document.querySelector("#scene"),
      ctx = c.getContext("2d");
    ctx.fillStyle = "#eee";
    ctx.fillRect(0, 0, 358, 68);
    for (let x = 0; x < 358; x += 12) {
      ctx.fillStyle = x % 24 ? "#ddd" : "#aaa";
      ctx.fillRect(x, 0, 3, 68);
    }
    const m = await import("/src/experiments/navGlass.js");
    window.exp = m.mountNavGlass(document.querySelector("nav"), c);
    return { mode: window.exp.mode, frames: window.exp.frames };
  });
  await p.screenshot({ path: `data/startup-review/${engine}-webgl.png` });
  const before = await p.evaluate(() => window.exp.frames);
  await p.waitForTimeout(1000);
  const after = await p.evaluate(() => window.exp.frames);
  assert.equal(after, before, "no idle frames");
  const sample = await p.evaluate(() => {
    let t = performance.now();
    let nav = document.querySelector("nav");
    for (let n = 0; n < 20; n++) {
      nav.dispatchEvent(new PointerEvent("pointerdown"));
      window.dispatchEvent(new PointerEvent("pointerup"));
    }
    return performance.now() - t;
  });
  const fallback = await p.evaluate(() => {
    window.exp.destroy();
    HTMLCanvasElement.prototype.getContext = () => null;
    return import("/src/experiments/navGlass.js").then(
      (m) =>
        m.mountNavGlass(
          document.querySelector("nav"),
          document.querySelector("#scene"),
        ).mode,
    );
  });
  assert.equal(fallback, "css");
  await fs.writeFile(
    `data/startup-review/${engine}-optics.json`,
    JSON.stringify(
      {
        ...metrics,
        idleFrames: after - before,
        eventDispatch20PairsMs: sample,
        fallback,
        physicalDevice: false,
        background: "synthetic calibration stripes; not live DOM capture",
      },
      null,
      2,
    ),
  );
  console.log(
    engine,
    metrics,
    "idle frames",
    after - before,
    "fallback",
    fallback,
  );
} finally {
  await b.close();
  await vite.close();
}
