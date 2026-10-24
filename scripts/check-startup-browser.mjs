import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "../frontend/node_modules/vite/dist/node/index.js";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createHarness } from "../site/scripts/check-cloud-backend.mjs";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const out = "data/startup-review";
await fs.mkdir(out, { recursive: true });
const h = await createHarness();
const result = await (
  await h.request("/guest/create", {
    method: "POST",
    data: { name: "启动隔离宿舍", nickname: "体验者", members: ["小林"] },
  })
).json();
const member = result.dorm.members[0];
const claim = await (
  await h.request("/chores/claim", {
    method: "POST",
    data: { invite_code: result.invite_code, nickname: member.nickname },
  })
).json();
const room = {
  id: result.dorm.id,
  name: "启动隔离宿舍",
  invite_code: result.invite_code,
  member_id: member.user_id,
  nickname: member.nickname,
  marker_id: member.marker_id,
  is_creator: false,
};
const vite = await createServer({
  root: process.env.DORM_BASELINE_ROOT || process.cwd() + "/frontend",
  configFile:
    (process.env.DORM_BASELINE_ROOT || process.cwd() + "/frontend") +
    "/vite.config.ts",
  server: { host: "127.0.0.1", port: 8094, strictPort: true, proxy: {} },
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
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const p = await ctx.newPage();
p.setDefaultTimeout(30000);
let logged = true,
  fail = false,
  release;
let gate = new Promise((r) => (release = r));
let delaying = true;
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.route(/\/(email|chores|auth|dorms|guest|health)\//, async (route) => {
  const req = route.request(),
    u = new URL(req.url());
  if (u.pathname.startsWith("/email/")) {
    if (delaying) await gate;
    if (fail) return route.abort("failed");
    const data =
      u.pathname === "/email/config"
        ? { available: true, registration_required: true }
        : u.pathname === "/email/me"
          ? {
              logged_in: logged,
              email: logged ? "test@example.invalid" : "",
              rooms: logged ? [room] : [],
            }
          : u.pathname === "/email/enter"
            ? { ...room, access_token: claim.access_token }
            : {};
    return route.fulfill({ json: data });
  }
  if (u.pathname === "/health")
    return route.fulfill({ json: { status: "ok" } });
  const response = await h.request(u.pathname + u.search, {
    method: req.method(),
    token: req.headers().authorization?.replace(/^Bearer /, ""),
    ...(req.postData() ? { data: JSON.parse(req.postData()) } : {}),
  });
  return route.fulfill({
    status: response.status,
    contentType: "application/json",
    body: await response.text(),
  });
});
let count = 0;
const check = (v, label) => {
  assert(v, label);
  count++;
  console.log("PASS " + engine + " " + label);
};
try {
  if (process.env.DORM_BASELINE_ROOT) {
    release();
    delaying = false;
    await p.goto("http://127.0.0.1:8094/water");
    await p.getByRole("button", { name: "查看任务", exact: true }).click();
    const old = p.locator(".elastic-sheet");
    await old.waitFor();
    await old.evaluate(
      async (el) =>
        await Promise.allSettled(el.getAnimations().map((a) => a.finished)),
    );
    await p.screenshot({ path: `${out}/${engine}-water-before.png` });
    console.log("baseline water capture complete");
  } else {
    await p.goto("http://127.0.0.1:8094/", { waitUntil: "domcontentloaded" });
    await p.locator('[data-startup="verifying"]').waitFor();
    check(
      (await p.locator(".guest-page").count()) === 0,
      "no login DOM while identity is verifying",
    );
    await p.screenshot({ path: `${out}/${engine}-startup-light.png` });
    release();
    delaying = false;
    await p.locator(".chore-board").waitFor();
    check(
      (await p.locator(".startup-gate").count()) === 0 ||
        (await p
          .locator(".startup-gate")
          .evaluate((el) => getComputedStyle(el).pointerEvents === "none")),
      "authenticated cold start reaches board",
    );
    await p.goto("http://127.0.0.1:8094/water");
    await p.getByRole("button", { name: "查看任务", exact: true }).click();
    const sheet = p.locator(".is-edge-sheet .elastic-sheet");
    await sheet.waitFor();
    await sheet.evaluate(
      async (el) =>
        await Promise.allSettled(el.getAnimations().map((a) => a.finished)),
    );
    const rect = await sheet.boundingBox();
    check(
      Math.abs(rect.y + rect.height - 844) < 2,
      "water detail reaches viewport bottom",
    );
    await p.screenshot({ path: `${out}/${engine}-water-after.png` });
    await p.getByRole("button", { name: "关闭详情", exact: true }).click();
    logged = false;
    await p.reload();
    await p.locator(".guest-page").waitFor();
    check(
      (await p.locator(".chore-board").count()) === 0,
      "logged-out cold start exposes entry only after server reply",
    );
    fail = true;
    await p.reload();
    await p.locator('[data-startup="recovery-failed"]').waitFor();
    check(
      (await p.locator(".guest-page").count()) === 0,
      "network failure shows retry rather than false logged-out entry",
    );
    fail = false;
    logged = true;
    await p.getByRole("button", { name: "重试", exact: true }).click();
    await p.locator(".chore-board").waitFor();
    check(true, "network recovery resumes identity");
    await p.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await p.reload();
    await p.locator(".chore-board").waitFor();
    check(true, "dark reduced-motion cold start settles");
    check(errors.length === 0, JSON.stringify(errors));
    await fs.writeFile(
      `${out}/${engine}-startup-result.json`,
      JSON.stringify({ checks: count, errors, realDevices: false }, null, 2),
    );
  }
} catch (e) {
  console.error("PAGE_ERRORS", errors);
  console.error((await p.content()).slice(-1200));
  await p.screenshot({ path: `${out}/${engine}-failure.png` });
  throw e;
} finally {
  await b.close();
  await vite.close();
  h.close?.();
}
