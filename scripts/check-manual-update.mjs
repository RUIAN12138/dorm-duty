// Two actual production builds + real Service Worker activation, isolated dorm.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { execFileSync } from "node:child_process";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createHarness } from "../site/scripts/check-cloud-backend.mjs";
import { ensureLocalDemo } from "../site/local/database.mjs";
const root = new URL("../", import.meta.url).pathname,
  front = path.join(root, "frontend");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "dorm-manual-update-"));
const versions = ["20261021-update-qa-v1", "20261021-update-qa-v2"];
const h = await createHarness();
h.env.DEFAULT_DORM_INVITE_CODE = ensureLocalDemo(h.db);
const checks = [],
  errors = [];
let browser,
  server,
  deployed = 0,
  failHealth = false,
  healthDelay = 0,
  healthRequests = 0;
const check = (v, label) => {
  assert(v, label);
  checks.push(label);
};
try {
  for (let i = 0; i < 2; i++)
    execFileSync(
      process.execPath,
      [
        path.join(front, "node_modules/vite/bin/vite.js"),
        "build",
        "--outDir",
        path.join(temp, String(i)),
      ],
      {
        cwd: front,
        env: {
          ...process.env,
          DORM_WEB_BASE: "/dorm-duty/",
          DORM_RELEASE_NAME: versions[i],
        },
        stdio: "pipe",
      },
    );
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
      if (route === "/health/legacy.html") {
        res.writeHead(200, {
          "Content-Type": "text/html",
          "Cache-Control": "no-store",
        });
        return res.end(`<button id="activate">旧版更新页面</button><script>
          sessionStorage.setItem('legacy-boots',String(Number(sessionStorage.getItem('legacy-boots')||0)+1));
          window.armed=false;
          navigator.serviceWorker.addEventListener('controllerchange',()=>{if(window.armed){sessionStorage.setItem('legacy-controlled','yes');location.reload()}});
          navigator.serviceWorker.register('/dorm-duty/sw.js',{scope:'/dorm-duty/'}).then(reg=>{
            window.legacyReg=reg;
            document.querySelector('button').onclick=()=>{window.armed=true;reg.waiting.postMessage({type:'SKIP_WAITING'})};
          });
        </script>`);
      }
      if (route === "/health") {
        healthRequests++;
        await new Promise((r) => setTimeout(r, healthDelay));
        return json(
          failHealth
            ? { detail: "offline" }
            : { status: "ok", release: { version: versions[deployed] } },
          failHealth ? 503 : 200,
        );
      }
      if (route === "/email/config")
        return json({
          available: false,
          registration_required: false,
          version: versions[deployed],
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
      const dir = path.join(temp, String(deployed));
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
    serviceWorkers: "allow",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    (v) => localStorage.setItem("lundao-release-notices-v1", JSON.stringify(v)),
    versions,
  );
  await page.goto(url);
  await page.getByTestId("guest-demo-entry").waitFor();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByTestId("guest-demo-entry").click();
  await page.locator(".guest-member-list button").first().click();
  await page.getByTestId("pane-duty").waitFor();
  await page.waitForTimeout(700);
  const choice = await page.evaluate(() =>
    localStorage.getItem("dorm-guest-view-v1"),
  );
  await page.getByTestId("open-tools").click();
  const button = page.getByTestId("check-update");
  await button.waitFor();
  check(
    await page.locator(".sheet-content").evaluate((el) => {
      const page = el.querySelector(".sheet-navigation-page") || el;
      return (
        page.lastElementChild?.getAttribute("data-testid") === "settings-update"
      );
    }),
    "check updates is the last item in settings",
  );
  healthDelay = 800;
  const before = healthRequests;
  await button.click();
  await page
    .getByRole("button", { name: "正在检查更新…", exact: true })
    .waitFor();
  check(
    await button.isDisabled(),
    "checking is visible and blocks duplicate taps",
  );
  await page
    .getByRole("button", { name: "已是最新版本 · 再次检查", exact: true })
    .waitFor();
  check(
    healthRequests === before + 1,
    "manual check makes exactly one fresh health request",
  );
  healthDelay = 0;
  check(
    (await page.locator(".update-result").innerText()) === "当前版本 v1",
    "settings shows the installed frontend version",
  );
  failHealth = true;
  await button.click();
  await page.locator('.update-result[role="alert"]').waitFor();
  await page
    .getByText("暂时无法检查版本，请稍后重试", { exact: true })
    .waitFor();
  check(
    (await page.locator(".update-result").innerText()).includes("无法检查"),
    "failed check reports failure instead of claiming latest",
  );
  failHealth = false;
  await button.click();
  await page
    .getByRole("button", { name: "已是最新版本 · 再次检查", exact: true })
    .waitFor();
  await ctx.setOffline(true);
  await button.click();
  await page.getByText("当前离线，请联网后检查更新", { exact: true }).waitFor();
  check(true, "offline checking gives a retryable result");
  await ctx.setOffline(false);
  healthDelay = 9000;
  await button.click();
  await page
    .getByText("检查更新超时，请稍后重试", { exact: true })
    .waitFor({ timeout: 12000 });
  check(
    !(await button.isDisabled()),
    "stalled version reads time out and release the retry button",
  );
  healthDelay = 0;
  deployed = 1;
  await button.click();
  await page
    .getByRole("button", { name: "发现新版本 · 立即更新", exact: true })
    .waitFor({ timeout: 20000 });
  check(
    await page.evaluate(
      async () =>
        !!(await navigator.serviceWorker.getRegistration("/dorm-duty/"))
          ?.waiting,
    ),
    "new version is really downloaded and waiting before install is offered",
  );
  await Promise.all([page.waitForEvent("load"), button.click()]);
  await page.getByTestId("pane-duty").waitFor({ timeout: 20000 });
  check(
    (await page.evaluate(() => localStorage.getItem("dorm-guest-view-v1"))) ===
      choice,
    "real update reload restores the same dorm identity",
  );
  await page.getByTestId("open-tools").click();
  await page.getByTestId("check-update").waitFor();
  check(
    (await page.locator(".update-result").innerText()) === "当前版本 v2",
    "the newly loaded frontend is actually version two",
  );
  await page.getByTestId("check-update").click();
  await page
    .getByRole("button", { name: "已是最新版本 · 再次检查", exact: true })
    .waitFor();
  check(true, "updated application can check again without restart");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}px settings update has no horizontal overflow`,
    );
  }
  await ctx.close();
  // Browser/WebView without a controlling SW uses an explicit network reload.
  deployed = 0;
  const plain = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const other = await plain.newPage();
  other.on("pageerror", (e) => errors.push(e.message));
  await other.addInitScript(
    (v) => localStorage.setItem("lundao-release-notices-v1", JSON.stringify(v)),
    versions,
  );
  await other.goto(url);
  await other.getByRole("button", { name: "设置", exact: true }).click();
  await other.getByTestId("check-update").waitFor();
  deployed = 1;
  await other.getByTestId("check-update").click();
  await other
    .getByRole("button", { name: "发现新版本 · 立即更新", exact: true })
    .waitFor();
  await Promise.all([
    other.waitForEvent("load"),
    other.getByTestId("check-update").click(),
  ]);
  await other.getByRole("button", { name: "设置", exact: true }).click();
  await other.getByTestId("check-update").waitFor();
  check(
    (await other.locator(".update-result").innerText()) === "当前版本 v2",
    "non-SW browser also installs the current server frontend from settings",
  );
  await plain.close();
  deployed = 0;
  const legacyContext = await browser.newContext({ serviceWorkers: "allow" });
  const legacy = await legacyContext.newPage();
  legacy.on("pageerror", (e) => errors.push(e.message));
  await legacy.goto(origin + "/dorm-duty/health/legacy.html");
  await legacy.waitForFunction(
    () => !!window.legacyReg && !!navigator.serviceWorker.controller,
  );
  const boots = await legacy.evaluate(() =>
    Number(sessionStorage.getItem("legacy-boots")),
  );
  deployed = 1;
  await legacy.evaluate(async () => {
    await window.legacyReg.update();
  });
  await legacy.waitForFunction(() => !!window.legacyReg.waiting);
  await Promise.all([
    legacy.waitForEvent("load"),
    legacy.locator("#activate").click(),
  ]);
  check(
    await legacy.evaluate(
      () =>
        sessionStorage.getItem("legacy-controlled") === "yes" &&
        Number(sessionStorage.getItem("legacy-boots")) > 0,
    ),
    "pre-v63 update button receives controllerchange and reloads after explicit activation",
  );
  check(
    (await legacy.evaluate(() =>
      Number(sessionStorage.getItem("legacy-boots")),
    )) > boots,
    "legacy update really reloads instead of remaining on its old document",
  );
  await legacyContext.close();

  check(errors.length === 0, `no uncaught runtime errors: ${errors.join(";")}`);
  console.log(
    JSON.stringify({
      status: "passed",
      browser: safari ? "WebKit" : "Chromium",
      checks,
      scope:
        "two real builds, local HTTP secure-context SW, isolated demo data; no production account or task writes",
    }),
  );
} finally {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
  h.close();
  await fs.rm(temp, { recursive: true, force: true });
}
