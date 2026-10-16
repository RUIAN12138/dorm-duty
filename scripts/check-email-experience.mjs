// Real HTTPS + cookies + SQLite + Vue UI. Mail delivery is injected, never sent.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
          const response = await email.wrap(request, (r, emailCreator) =>
            handleApi(
              r,
              { ...h.env, EMAIL_CREATOR: emailCreator },
              { waitUntil() {} },
            ),
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
  check(
    await page.locator(".guest-brand").count(),
    0,
    "entry has no persistent corner brand",
  );
  await page.getByRole("button", { name: "邮箱账号", exact: true }).click();
  const hint = page.locator(".hint-popover");
  await hint.waitFor();
  const hintFrames = await hint.evaluate(async (el) => {
    const frames = [];
    for (let i = 0; i < 18; i++) {
      await new Promise(requestAnimationFrame);
      frames.push(Number(getComputedStyle(el).opacity));
    }
    return frames;
  });
  check(
    hintFrames.some((v) => v > 0 && v < 1),
    true,
    "hint visibly interpolates on opening",
  );
  const hintBox = await hint.boundingBox();
  check(
    Math.abs(hintBox.y + hintBox.height / 2 - 844 / 2) < 2,
    true,
    "hint is vertically centered",
  );
  check(
    await page
      .getByTestId("hint-glass")
      .evaluate((el) => getComputedStyle(el).backdropFilter === "none"),
    true,
    "hint backdrop dims without blur",
  );
  await page.screenshot({ path: path.join(evidence, "centered-hint.png") });
  await page.getByRole("button", { name: "知道了", exact: true }).click();
  await hint.waitFor({ state: "hidden" });
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
  async function login(p, address = "ui-qa@example.invalid", gate = false) {
    await p.getByLabel("邮箱", { exact: true }).fill(address);
    await p.getByRole("button", { name: "获取验证码", exact: true }).click();
    await p.getByLabel("验证码", { exact: true }).waitFor();
    const codeFrames = await p
      .locator(".email-code-field")
      .evaluate(async (el) => {
        const frames = [];
        for (let i = 0; i < 18; i++) {
          await new Promise(requestAnimationFrame);
          frames.push(Number(getComputedStyle(el).opacity));
        }
        return frames;
      });
    check(
      codeFrames.some((v) => v > 0 && v < 1),
      true,
      "code input fades and slides into the email step",
    );
    const submitBox = await p
      .locator("form > button[type=submit]")
      .boundingBox();
    const checkBox = await p.locator(".email-check").boundingBox();
    check(
      submitBox.y - (checkBox.y + checkBox.height) >= 24,
      true,
      "email input options and confirmation have a thumb-friendly gap",
    );
    const code = deliveries.at(-1).text.match(/验证码是：(\d{6})/)[1];
    await p.getByLabel("验证码", { exact: true }).fill(code);
    await p.getByRole("button", { name: /验证并(进入|绑定)/ }).click();
    if (!gate)
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
  // Reproduce a suspended page carrying a revoked member grant while its email
  // cookie remains valid. Keep the actual board DOM through asynchronous repair.
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("dorm-guest-view-v1")),
  );
  const previousToken = await page.evaluate(
    ({ invite_code, member_id }) =>
      localStorage.getItem(`dorm-chore-device-v1:${invite_code}:${member_id}`),
    saved,
  );
  h.db.sqlite
    .prepare("DELETE FROM email_grants WHERE token_hash=?")
    .run(createHash("sha256").update(previousToken).digest("hex"));
  let recoverRequests = 0;
  await page.route("**/email/enter", async (route) => {
    recoverRequests++;
    await new Promise((r) => setTimeout(r, 350));
    await route.continue();
  });
  await page.evaluate(() => {
    window.originalBoard = document.querySelector(
      '[data-testid="chore-board"]',
    );
    window.resumeFrames = [];
    window.resumeDone = new Promise((resolve) => {
      const start = performance.now();
      function frame() {
        window.resumeFrames.push({
          same:
            window.originalBoard ===
            document.querySelector('[data-testid="chore-board"]'),
          spinner: !!document.querySelector(".guest-loading,.board-loading"),
        });
        if (performance.now() - start < 1100) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate(() => window.resumeDone);
  await page.waitForFunction(
    ({ invite_code, member_id, old }) =>
      localStorage.getItem(
        `dorm-chore-device-v1:${invite_code}:${member_id}`,
      ) !== old,
    { ...saved, old: previousToken },
  );
  check(
    recoverRequests,
    1,
    "foreground events share one identity recovery request",
  );
  check(
    await page.evaluate(() =>
      window.resumeFrames.every((f) => f.same && !f.spinner),
    ),
    true,
    "identity recovery keeps the same task DOM without a loading flash",
  );
  check(
    await page
      .getByRole("heading", { name: "暂时无法查看", exact: true })
      .count(),
    0,
    "expired member grant never strands the user on a reload-only error",
  );
  await page.unroute("**/email/enter");
  await first.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.locator(".chore-inline-error").waitFor();
  check(
    await page.evaluate(
      () =>
        window.originalBoard ===
        document.querySelector('[data-testid="chore-board"]'),
    ),
    true,
    "offline resume preserves current screen and identity",
  );
  await first.setOffline(false);
  const resumedRead = page.waitForResponse(
    (r) => r.url().includes("/chores/board?") && r.status() === 200,
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
  });
  await resumedRead;
  await page.locator(".chore-inline-error").waitFor({ state: "hidden" });
  check(
    await page
      .getByRole("heading", { name: "暂时无法查看", exact: true })
      .count(),
    0,
    "reconnected foreground recovers without manually reloading",
  );
  let releaseSuspended, suspendedStarted;
  const suspended = new Promise((resolve) => {
    suspendedStarted = resolve;
  });
  const releaseRead = new Promise((resolve) => {
    releaseSuspended = resolve;
  });
  const boardPattern = /\/chores\/board\?/;
  let reads = 0;
  await page.route(boardPattern, async (route) => {
    if (++reads === 1) {
      suspendedStarted();
      await releaseRead;
    }
    try {
      await route.continue();
    } catch {
      /* Hidden read was aborted. */
    }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await suspended;
  const freshRead = page.waitForResponse(
    (r) => r.url().includes("/chores/board?") && r.status() === 200,
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await freshRead;
  releaseSuspended();
  await page.unroute(boardPattern);
  check(
    reads >= 2,
    true,
    "suspended read is cancelled and a fresh request starts on resume",
  );
  check(
    await page.evaluate(
      () =>
        window.originalBoard ===
        document.querySelector('[data-testid="chore-board"]'),
    ),
    true,
    "suspended request recovery preserves the task component",
  );
  const beforeReload = await page.evaluate(
    ({ invite_code, member_id }) =>
      localStorage.getItem(`dorm-chore-device-v1:${invite_code}:${member_id}`),
    saved,
  );
  await page.reload();
  await page.getByRole("button", { name: "更多操作", exact: true }).waitFor();
  check(
    (await page.getByText("邮箱界面 QA", { exact: true }).count()) > 0,
    true,
    "refresh restores current dorm",
  );
  check(
    await page.evaluate(
      ({ invite_code, member_id }) =>
        localStorage.getItem(
          `dorm-chore-device-v1:${invite_code}:${member_id}`,
        ),
      saved,
    ),
    beforeReload,
    "page reload reuses the active credential",
  );
  // Joining a new room is above the remembered-room list, with no dead top space.
  await page.getByRole("button", { name: "更多操作", exact: true }).click();
  await page.getByTestId("guest-change-dorm").click();
  await page
    .getByRole("heading", { name: "加入新宿舍", exact: true })
    .waitFor();
  const joinInput = await page.getByTestId("guest-invite").boundingBox();
  const joinButton = await page.getByTestId("guest-join-submit").boundingBox();
  const joined = await page
    .locator(".guest-switch-form .joined-dorms")
    .boundingBox();
  check(
    joinButton.y - (joinInput.y + joinInput.height) >= 46,
    true,
    "invite field and join button have a generous 48px gap",
  );
  check(
    joined.y > joinButton.y + joinButton.height,
    true,
    "join-new-room form comes before saved rooms",
  );
  check(
    (await page.locator("#switch-title").boundingBox()).y > 100 &&
      (await page.locator("#switch-title").boundingBox()).y < 260,
    true,
    "join form sits in the optical centre instead of at the top edge",
  );
  await page.screenshot({ path: path.join(evidence, "join-layout.png") });
  await page.getByRole("button", { name: "邀请码帮助", exact: true }).click();
  await page.locator(".hint-popover").waitFor();
  await page.waitForTimeout(220);
  const joinHint = await page.locator(".hint-popover").boundingBox();
  check(
    Math.abs(joinHint.y + joinHint.height / 2 - 844 / 2) < 2,
    true,
    "join help dialog is also centered",
  );
  await page.screenshot({ path: path.join(evidence, "join-hint.png") });
  await page.getByRole("button", { name: "知道了", exact: true }).click();
  await page.getByRole("button", { name: "返回当前任务", exact: true }).click();
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
  const createdRoom = h.db.sqlite
    .prepare("SELECT invite_code,id FROM dormitories WHERE name='邮箱界面 QA'")
    .get();
  const newMemberContext = await context();
  const newcomer = await newMemberContext.newPage();
  newcomer.on("pageerror", (e) => errors.push(e.message));
  await newcomer.goto(url);
  await login(newcomer, "new-member@example.invalid");
  await newcomer.getByTestId("guest-join-dorm").click();
  await newcomer.getByTestId("guest-invite").fill(createdRoom.invite_code);
  await newcomer.getByTestId("guest-join-submit").click();
  await newcomer.getByTestId("guest-member-name").fill("界面测试乙");
  await newcomer.getByTestId("guest-name-submit").click();
  await newcomer.getByTestId("marker-confirm").click();
  await newcomer
    .getByRole("button", { name: "更多操作", exact: true })
    .waitFor();
  const joinedMember = h.db.sqlite
    .prepare(
      "SELECT em.creator_verified FROM email_members em JOIN email_accounts e ON e.id=em.account_id WHERE e.email='new-member@example.invalid'",
    )
    .get();
  check(
    joinedMember.creator_verified,
    0,
    "verified newcomer joins by invite and exact name as an ordinary member",
  );
  await newMemberContext.close();
  // A saved pre-email creator identity must go through verification, then bind
  // with its original full proof, never create a duplicate room or user.
  const oldRoom = await h
    .request("/guest/create", {
      method: "POST",
      data: { name: "旧创建者迁移 QA", nickname: "旧创建者" },
    })
    .then((r) => r.json());
  const migration = await context();
  await migration.addInitScript(
    ({ room }) => {
      localStorage.setItem(
        "dorm-guest-view-v1",
        JSON.stringify({
          guest_mode: "dorm",
          invite_code: room.invite_code,
          member_id: room.member_id,
        }),
      );
      localStorage.setItem(
        `dorm-chore-device-v1:${room.invite_code}:${room.member_id}`,
        room.access_token,
      );
      localStorage.setItem("dorm-owner-token", room.access_token);
    },
    { room: oldRoom },
  );
  const old = await migration.newPage();
  old.on("pageerror", (e) => errors.push(e.message));
  await old.goto(url);
  await old.getByLabel("邮箱", { exact: true }).waitFor();
  check(
    await old.getByRole("button", { name: "更多操作", exact: true }).count(),
    0,
    "saved old credentials cannot bypass the email gate",
  );
  await login(old, "legacy-ui@example.invalid", true);
  await old.getByRole("button", { name: "更多操作", exact: true }).waitFor();
  check(
    h.db.sqlite
      .prepare("SELECT creator_verified FROM email_members WHERE user_id=?")
      .get(oldRoom.member_id).creator_verified,
    1,
    "old creator proves ownership once and retains the same member ID",
  );
  h.db.sqlite
    .prepare(
      "DELETE FROM email_sessions WHERE account_id=(SELECT id FROM email_accounts WHERE email='legacy-ui@example.invalid')",
    )
    .run();
  await old.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  await old.getByLabel("邮箱", { exact: true }).waitFor();
  await old.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
  });
  await old.waitForTimeout(200);
  check(
    await old
      .getByRole("heading", { name: "暂时无法查看", exact: true })
      .count(),
    0,
    "expired email session opens verification instead of a reload-only dead end",
  );
  await migration.close();
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
