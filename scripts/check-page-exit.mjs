// Actual production App/GuestHome routes in an isolated demo dorm.
// Inspect outgoing geometry as well as opacity; inert alone is not visual hiding.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createHarness } from "../site/scripts/check-cloud-backend.mjs";
import { ensureLocalDemo } from "../site/local/database.mjs";
const root = new URL("../", import.meta.url).pathname,
  front = path.join(root, "frontend");
const temp = path.join(front, "dist-server");
const h = await createHarness();
h.env.DEFAULT_DORM_INVITE_CODE = ensureLocalDemo(h.db);
const checks = [],
  errors = [];
let browser, server;
function translation(value) {
  const numbers = value
    .match(/matrix\(([^)]+)\)/)?.[1]
    .split(",")
    .map(Number);
  return { x: numbers?.[4] || 0, y: numbers?.[5] || 0 };
}
const check = (v, label) => {
  assert(v, label);
  checks.push(label);
};
try {
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
    ".woff2": "font/woff2",
  };
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1"),
        route = url.pathname.replace(/^\/dorm-duty(?=\/)/, "");
      const json = (value, status = 200) => {
        res.writeHead(status, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(value));
      };
      if (route === "/email/config")
        return json({
          available: false,
          registration_required: false,
          version: "page-exit-qa",
        });
      if (route === "/email/me") return json({ logged_in: false, rooms: [] });
      if (/^\/(guest|chores|auth|dorms)\//.test(route)) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const response = await h.request(route + url.search, {
          method: req.method,
          token: req.headers.authorization?.replace(/^Bearer /, ""),
          ...(chunks.length ? { data: JSON.parse(Buffer.concat(chunks)) } : {}),
        });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
      const dir = temp;
      let file = path.resolve(dir, "." + route);
      if (
        !file.startsWith(dir + path.sep) ||
        !(await fs.stat(file).catch(() => null))?.isFile()
      )
        file = path.join(dir, "index.html");
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(500);
      res.end("fixture error");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`,
    url = origin + "/dorm-duty/";
  const safari = process.env.DORM_BROWSER === "webkit";
  browser = await (safari ? webkit : chromium).launch({
    headless: true,
    ...(!safari && process.platform === "darwin"
      ? {
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        }
      : {}),
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByTestId("guest-demo-entry").click();
  await page.locator(".guest-member-list button").first().click();
  await page.getByTestId("pane-duty").waitFor();
  await page.waitForTimeout(1400);
  for (const [source, target] of [
    ["duty", "calendar"],
    ["water", "calendar"],
    ["duty", "water"],
    ["water", "duty"],
  ]) {
    await page.getByTestId(`nav-${source}`).click();
    await page.getByTestId(`pane-${source}`).waitFor();
    await page.waitForTimeout(850);
    await page.evaluate((source) => {
      const root = document.querySelector(
        `[data-testid="pane-${source}"]`,
      ).parentElement;
      const title = root.querySelector(".task-title-stage,.water-title-stage");
      const rect = title.getBoundingClientRect();
      window.exitBaseline = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
      window.exitFrames = [];
      const start = performance.now();
      function frame() {
        const panes = [...document.querySelectorAll(".focus-pane")].map(
          (pane) => {
            const style = getComputedStyle(pane),
              title = pane.querySelector(
                ".task-title-stage,.water-title-stage",
              ),
              r = title?.getBoundingClientRect();
            return {
              page: pane.querySelector("[data-testid^='pane-']")?.dataset
                .testid,
              inert: pane.hasAttribute("inert"),
              opacity: Number(style.opacity),
              transform: style.transform,
              title: r
                ? { x: r.x, y: r.y, width: r.width, height: r.height }
                : null,
              children: title
                ? title
                    .getAnimations({ subtree: true })
                    .map((a) => ({
                      state: a.playState,
                      duration: a.effect.getTiming().duration,
                    }))
                : [],
            };
          },
        );
        const calendar = document.querySelector(
          ".calendar-page:not([inert]) .compact-calendar header",
        );
        window.exitFrames.push({
          at: performance.now() - start,
          panes,
          calendarOpacity: calendar
            ? Number(getComputedStyle(calendar).opacity)
            : null,
        });
        if (performance.now() - start < 850) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }, source);
    await page.getByTestId(`nav-${target}`).click();
    await page.getByTestId(`pane-${target}`).waitFor();
    await page.waitForTimeout(900);
    const data = await page.evaluate(() => ({
      baseline: window.exitBaseline,
      frames: window.exitFrames,
    }));
    const evidence = path.join(root, "data/v63");
    await fs.mkdir(evidence, { recursive: true });
    await fs.writeFile(
      path.join(
        evidence,
        `exit-${source}-${target}-${safari ? "webkit" : "chromium"}.json`,
      ),
      JSON.stringify(data, null, 2),
    );
    const oldFrames = data.frames.flatMap((f) =>
      f.panes
        .filter((p) => p.page === `pane-${source}` && p.inert)
        .map((p) => ({ ...p, at: f.at })),
    );
    check(
      oldFrames.length > 0,
      `${source}-to-${target} has outgoing transition frames`,
    );
    check(
      oldFrames.some((f) => f.opacity > 0 && f.opacity < 1),
      `${source}-to-${target} retains an animated exit`,
    );
    check(
      oldFrames.every((f) => {
        const shift = translation(f.transform);
        return (
          Math.abs(f.title.y - shift.y - data.baseline.y) < 1 &&
          Math.abs(f.title.x - shift.x - data.baseline.x) < 1 &&
          Math.abs(f.title.width - data.baseline.width) < 1 &&
          Math.abs(f.title.height - data.baseline.height) < 1
        );
      }),
      `${source}-to-${target} fades without resizing or jumping the outgoing content`,
    );
    check(
      oldFrames.every(
        (f, i) => i === 0 || f.opacity <= oldFrames[i - 1].opacity + 0.005,
      ),
      `${source}-to-${target} never flashes the outgoing content back to full opacity`,
    );
    check(
      data.frames.every(
        (f) =>
          f.panes.filter((p) => p.opacity > 0.01).length <= 1 &&
          f.panes.every(
            (p) => p.page === `pane-${source}` || p.page === `pane-${target}`,
          ),
      ),
      `${source}-to-${target} never shows an intermediate or overlapping page`,
    );
    if (target === "calendar")
      check(
        data.frames.some((f) => f.calendarOpacity > 0 && f.calendarOpacity < 1),
        `${source}-to-calendar preserves progressive content entrance`,
      );
  }
  // Interrupt both an exit and the next page's layered entrance with real taps.
  await page.getByTestId("nav-duty").click();
  await page.getByTestId("pane-duty").waitFor();
  await page.waitForTimeout(850);
  await page.evaluate(() => {
    window.rapidFrames = [];
    const start = performance.now();
    function frame() {
      window.rapidFrames.push(
        [...document.querySelectorAll(".focus-pane")]
          .filter((p) => Number(getComputedStyle(p).opacity) > 0.01)
          .map(
            (p) => p.querySelector("[data-testid^='pane-']")?.dataset.testid,
          ),
      );
      if (performance.now() - start < 2000) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  for (const target of ["calendar", "water", "duty", "calendar", "water"]) {
    await page.getByTestId(`nav-${target}`).click();
    await page.waitForTimeout(35);
  }
  await page.getByTestId("pane-water").waitFor();
  await page.waitForTimeout(900);
  check(
    await page.evaluate(() => window.rapidFrames.every((f) => f.length <= 1)),
    "rapid interrupted navigation never leaves two visible pages",
  );
  check(
    (await page.locator(".focus-pane").count()) === 1 &&
      (await page.getByTestId("pane-water").isVisible()),
    "rapid navigation settles on the latest requested page without residual layers",
  );
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByTestId("nav-calendar").click();
    await page.getByTestId("pane-calendar").waitFor();
    await page.waitForTimeout(750);
    check(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.querySelectorAll(".focus-pane").length === 1,
      ),
      `${width}px calendar settles without overflow or stale task pane`,
    );
    await page.getByTestId("nav-duty").click();
    await page.getByTestId("pane-duty").waitFor();
    await page.waitForTimeout(750);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId("pane-calendar").waitFor();
  await page.waitForTimeout(50);
  check(
    (await page.locator(".focus-pane").count()) === 1,
    "reduced motion immediately replaces the outgoing pane",
  );
  check(
    errors.length === 0,
    "no runtime errors during normal, interrupted or reduced-motion navigation",
  );
  console.log(
    JSON.stringify(
      {
        browser: safari ? "webkit" : "chromium",
        passed: checks.length,
        checks,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
  h.close();
}
