// Real HTTPS + cookies + SQLite + Vue UI. Mail delivery is injected, never sent.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import { execFileSync } from "node:child_process";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createHarness } from "../site/scripts/check-cloud-backend.mjs";
import { handleApi } from "../site/worker/backend.mjs";
import module from "../site/runtime/email-runtime.cjs";
const h = await createHarness(),
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dorm-email-ui-"));
const root = new URL("../", import.meta.url).pathname;
let browser, server, email;
let clock = Date.now();
const deliveries = [],
  errors = [],
  checks = [];
const check = (a, b, label) => {
  assert.deepEqual(a, b, label);
  checks.push(label);
};
try {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      path.join(temporary, "key.pem"),
      "-out",
      path.join(temporary, "cert.pem"),
      "-subj",
      "/CN=127.0.0.1",
      "-days",
      "1",
    ],
    { stdio: "ignore" },
  );
  const dist = path.join(root, "frontend/dist-server");
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
  };
  server = https.createServer(
    {
      key: await fs.readFile(path.join(temporary, "key.pem")),
      cert: await fs.readFile(path.join(temporary, "cert.pem")),
    },
    async (req, res) => {
      try {
        const url = new URL(req.url, origin);
        url.pathname = url.pathname.replace(/^\/dorm-duty(?=\/)/, "");
        if (/^\/(email|guest|chores|auth|dorms)\//.test(url.pathname)) {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const request = new Request(url, {
            method: req.method,
            headers: req.headers,
            body: ["GET", "HEAD"].includes(req.method)
              ? undefined
              : Buffer.concat(chunks),
          });
          const response = await email.wrap(request, (r) =>
            handleApi(r, h.env, { waitUntil() {} }),
          );
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(Buffer.from(await response.arrayBuffer()));
        } else {
          let file = path.resolve(dist, "." + url.pathname);
          if (
            !file.startsWith(dist + path.sep) ||
            !(await fs.stat(file).catch(() => null))?.isFile()
          )
            file = path.join(dist, "index.html");
          res.writeHead(200, {
            "Content-Type":
              types[path.extname(file)] || "application/octet-stream",
          });
          res.end(await fs.readFile(file));
        }
      } catch {
        res.writeHead(500);
        res.end("fixture request failed");
      }
    },
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `https://127.0.0.1:${server.address().port}`,
    url = origin + "/dorm-duty/";
  email = module.createEmailRuntime(h.db, {
    config: {
      host: "smtp.example.invalid",
      port: 465,
      user: "fixture@example.invalid",
      password: "fixture-only",
      from: "fixture@example.invalid",
      publicOrigin: origin,
      otpSecret: "d".repeat(64),
    },
    base: "/dorm-duty/",
    now: () => new Date(clock),
    autoStart: false,
    send: async (message) => deliveries.push(message),
  });
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
  async function context(width = 390) {
    return browser.newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
      ignoreHTTPSErrors: true,
      serviceWorkers: "block",
    });
  }
  const first = await context(),
    page = await first.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByLabel("邮箱", { exact: true }).waitFor();
  await page.waitForTimeout(350);
  const evidence = path.join(root, "docs/evidence/email-accounts");
  await fs.mkdir(evidence, { recursive: true });
  await page.screenshot({ path: path.join(evidence, "entry.png") });
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `${width}px entry has no horizontal overflow`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const control = page.getByRole("button", { name: "获取验证码", exact: true });
  const box = await control.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(100);
  check(
    await control.evaluate((e) => getComputedStyle(e).transform !== "none"),
    true,
    "email submit keeps press feedback",
  );
  await page.mouse.up();
  async function login(p) {
    await p.getByLabel("邮箱", { exact: true }).fill("ui-qa@example.invalid");
    await p.getByRole("button", { name: "获取验证码", exact: true }).click();
    await p.getByLabel("验证码", { exact: true }).waitFor();
    const code = deliveries.at(-1).text.match(/验证码是：(\d{6})/)[1];
    await p.getByLabel("验证码", { exact: true }).fill(code);
    await p.getByRole("button", { name: "验证并进入", exact: true }).click();
    await p.getByRole("heading", { name: "先找到你的宿舍" }).waitFor();
  }
  await login(page);
  check(
    (await first.cookies()).some(
      (c) =>
        c.name === "dorm_email_session" &&
        c.httpOnly &&
        c.secure &&
        c.path === "/dorm-duty/",
    ),
    true,
    "HTTPS cookie is HttpOnly, Secure and scoped to deployment path",
  );
  await page.getByTestId("guest-create-dorm").click();
  await page.getByTestId("guest-create-name").fill("邮箱界面 QA");
  await page.getByTestId("guest-create-nickname").fill("界面测试甲");
  await page.getByTestId("guest-create-members").fill("界面测试乙");
  await page.getByTestId("guest-create-submit").click();
  await page.getByRole("button", { name: "更多操作", exact: true }).waitFor();
  check(
    h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM email_members").get().n,
    1,
    "new dorm automatically binds its creator to verified account",
  );
  await page.reload();
  await page.getByRole("button", { name: "更多操作", exact: true }).waitFor();
  check(
    (await page.getByText("邮箱界面 QA", { exact: true }).count()) > 0,
    true,
    "refresh restores current dorm",
  );
  clock += 61000;
  const second = await context(320),
    other = await second.newPage();
  other.on("pageerror", (e) => errors.push(e.message));
  await other.goto(url);
  await login(other);
  await other.getByRole("button", { name: /邮箱界面 QA/ }).click();
  await other.getByRole("button", { name: "更多操作", exact: true }).waitFor();
  check(
    (await other.getByText("邮箱界面 QA", { exact: true }).count()) > 0,
    true,
    "another device restores linked dorm without name claim",
  );
  await other.getByRole("button", { name: "更多操作", exact: true }).click();
  await other.getByTestId("open-preferences").click();
  await other.getByTestId("open-email-account").click();
  await other.getByText("ui-qa@example.invalid", { exact: true }).waitFor();
  await other.waitForTimeout(350);
  const panel = other.getByTestId("email-account-panel");
  check(
    await panel.evaluate((e) => e.scrollWidth <= e.clientWidth),
    true,
    "email settings fit a 320px sheet",
  );
  await other.screenshot({ path: path.join(evidence, "account-sheet.png") });
  await other
    .getByRole("button", { name: "退出邮箱账号", exact: true })
    .click();
  await other.getByLabel("邮箱", { exact: true }).waitFor();
  check(
    await other.getByRole("button", { name: "更多操作", exact: true }).count(),
    0,
    "logout clears current identity view",
  );
  check(errors, [], "no uncaught browser errors");
  console.log(
    JSON.stringify(
      {
        status: "passed",
        browser: safari ? "webkit" : "chromium",
        checks,
        scope:
          "real HTTPS, SQLite and frontend; injected mail transport, no real inbox delivery claimed",
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await email?.close();
  if (server) await new Promise((r) => server.close(r));
  h.close();
  await fs.rm(temporary, { recursive: true, force: true });
}
