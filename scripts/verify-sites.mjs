import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "../frontend/node_modules/@playwright/test/index.mjs";

// Credentials enter only over stdin and remain in memory. Never pass them as
// command arguments, environment variables, or Playwright extraHTTPHeaders.
async function readInput() {
  let hidden = false;
  let reader;
  try {
    if (process.stdin.isTTY) {
      const result = spawnSync("stty", ["-echo"], {
        stdio: ["inherit", "ignore", "ignore"],
      });
      if (result.status !== 0) throw new Error("cannot_disable_terminal_echo");
      hidden = true;
      process.stdout.write(
        "Ready for one JSON line on stdin (echo disabled).\n",
      );
    }
    reader = createInterface({ input: process.stdin, terminal: false });
    for await (const line of reader) {
      if (line.length > 65536) throw new Error("input_too_large");
      const input = JSON.parse(line);
      const url = new URL(input.baseUrl);
      assert.equal(url.protocol, "https:", "HTTPS is required");
      assert(!url.username && !url.password, "URL credentials are prohibited");
      assert.equal(url.pathname, "/", "baseUrl must be the site origin");
      assert(!url.search && !url.hash, "URL query and fragment are prohibited");
      assert(
        input.serviceToken === undefined ||
          typeof input.serviceToken === "string",
        "serviceToken must be a string",
      );
      return { baseUrl: url.origin, serviceToken: input.serviceToken || "" };
    }
    throw new Error("missing_stdin_json");
  } finally {
    reader?.close();
    if (hidden)
      spawnSync("stty", ["echo"], {
        stdio: ["inherit", "ignore", "ignore"],
      });
  }
}

const output = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../docs/evidence/sites-deploy",
);
const privateApi = /^\/(auth|dorms|duties|notifications|push)(\/|$)/;
const platformHeader = "OAI-Sites-Authorization";
let browser;
let input;
let phase = "input";
const secrets = [];
const runtimeErrors = [];
const overflow = [];
const checks = [];
const evidence = {
  date: new Date().toISOString(),
  browser: "Chrome headless, mobile emulation 390×844",
  viewport: { width: 390, height: 844 },
  iphone: "not tested on physical hardware",
  push: "not tested",
};

function sanitized(message) {
  let clean = String(message);
  for (const secret of secrets)
    if (secret) clean = clean.split(secret).join("[redacted]");
  return clean
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[redacted JWT]")
    .split("\n")[0]
    .slice(0, 250);
}

try {
  input = await readInput();
  secrets.push(input.serviceToken);
  evidence.baseUrl = input.baseUrl;
  await fs.mkdir(output, { recursive: true });

  // Node fetch does not follow redirects: a platform token must never reach
  // an identity provider, tunnel URL, or any origin other than this Site.
  async function api(
    route,
    { token, method = "GET", data, status = 200 } = {},
  ) {
    const url = new URL(route, input.baseUrl);
    assert.equal(
      url.origin,
      input.baseUrl,
      "cross-origin API request prohibited",
    );
    const headers = { Accept: "application/json" };
    if (input.serviceToken)
      headers[platformHeader] = `Bearer ${input.serviceToken}`;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(url, {
      method,
      headers,
      body: data === undefined ? undefined : JSON.stringify(data),
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if (
      response.status === 403 ||
      (response.status === 401 && status !== 401)
    ) {
      throw new Error(
        `platform_or_business_access_denied: HTTP ${response.status} on ${url.pathname}`,
      );
    }
    assert.equal(
      response.status,
      status,
      `${url.pathname}: unexpected HTTP ${response.status}`,
    );
    assert(
      /(?:^|,)\s*no-store\b/i.test(response.headers.get("cache-control") || ""),
      `${url.pathname}: no-store missing`,
    );
    assert(
      /\bjson\b/i.test(response.headers.get("content-type") || ""),
      `${url.pathname}: non-JSON response; check Sites access or API proxy`,
    );
    return response.json();
  }

  phase = "browser_launch";
  browser = await chromium.launch({
    headless: true,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  async function mobilePage() {
    const context = await browser.newContext({
      viewport: evidence.viewport,
      isMobile: true,
      hasTouch: true,
    });
    // A global extraHTTPHeaders token could leak to third-party resources.
    // Interception adds the independent Sites header strictly to the Site origin.
    await context.route("**/*", async (route) => {
      const request = route.request();
      const headers = { ...request.headers() };
      delete headers[platformHeader.toLowerCase()];
      if (new URL(request.url()).origin === input.baseUrl && input.serviceToken)
        headers[platformHeader] = `Bearer ${input.serviceToken}`;
      if (
        new URL(request.url()).origin === input.baseUrl &&
        input.serviceToken
      ) {
        // route.continue header overrides persist through redirects. A single
        // fetch hop prevents that; each redirect is handled again by the browser.
        const response = await route.fetch({ headers, maxRedirects: 0 });
        await route.fulfill({ response });
      } else {
        await route.continue({ headers });
      }
    });
    context.setDefaultTimeout(20000);
    const page = await context.newPage();
    page.on("pageerror", (error) =>
      runtimeErrors.push(sanitized(error.message)),
    );
    return page;
  }
  const a = await mobilePage();
  const b = await mobilePage();
  const suffix = `${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const accounts = {
    admin: `sites_admin_${suffix}`,
    member: `sites_member_${suffix}`,
  };
  const password = randomBytes(18).toString("base64url");
  secrets.push(password);
  evidence.accounts = accounts;

  async function register(page, username, nickname) {
    const response = await page.goto(`${input.baseUrl}/login`);
    if (response?.status() >= 400)
      throw new Error(
        `platform_access_or_site_failure: HTTP ${response.status()}`,
      );
    assert.equal(
      new URL(page.url()).origin,
      input.baseUrl,
      "platform redirected to external identity provider",
    );
    await page.getByRole("button", { name: "注册账号", exact: true }).click();
    await page.getByPlaceholder("3–32 位字母、数字或下划线").fill(username);
    await page.getByPlaceholder("室友怎么称呼你").fill(nickname);
    await page.getByPlaceholder("至少 8 位").fill(password);
    await page.getByRole("button", { name: "注册并开始使用" }).click();
    await page.waitForURL(`${input.baseUrl}/`);
    const token = await page.evaluate(() =>
      sessionStorage.getItem("dorm-token"),
    );
    assert(token, "business login token missing");
    secrets.push(token);
    return token;
  }

  phase = "UI_registration";
  const tokenA = await register(a, accounts.admin, "站点验收甲");
  const tokenB = await register(b, accounts.member, "站点验收乙");
  checks.push("two independent business accounts registered through mobile UI");

  phase = "isolated_dorm_and_schedule";
  const created = await api("/dorms", {
    token: tokenA,
    method: "POST",
    status: 201,
    data: { name: `Sites验收_${suffix}` },
  });
  const joined = await api("/dorms/join", {
    token: tokenB,
    method: "POST",
    data: { invite_code: created.invite_code },
  });
  assert.equal(joined.id, created.id, "members joined different dorms");
  evidence.dormId = created.id;
  const dorm = await api("/dorms/current", { token: tokenA });
  const today = await api("/duties/today", { token: tokenA });
  await api("/duties/generate", {
    token: tokenA,
    method: "POST",
    data: {
      start_date: today.today,
      days: 30,
      expected_version: dorm.schedule_version,
    },
  });
  const me = await api("/auth/me", { token: tokenA });
  const pending = (await api("/duties/today", { token: tokenA })).task;
  assert(pending, "today duty missing");
  if (pending.assignee_id !== me.id) {
    const current = await api("/dorms/current", { token: tokenA });
    await api(`/duties/${pending.id}`, {
      token: tokenA,
      method: "PATCH",
      data: { assignee_id: me.id, expected_version: current.schedule_version },
    });
  }
  checks.push("isolated test dorm, invitation join and 30-day schedule");

  phase = "mobile_completion_and_sync";
  await a.goto(`${input.baseUrl}/`);
  await a
    .getByRole("button", { name: /完成值日打卡|补打卡，记录完成/ })
    .click();
  for (const page of [a, b]) {
    await page.reload();
    await page
      .getByText("今天的小事，已经被认真做好。", { exact: false })
      .waitFor();
  }
  const completedA = (await api("/duties/today", { token: tokenA })).task;
  const completedB = (await api("/duties/today", { token: tokenB })).task;
  assert.equal(completedA.status, "completed");
  assert.equal(completedA.completed_at, completedB.completed_at);
  await api(`/duties/${completedA.id}/complete`, {
    token: tokenA,
    method: "PATCH",
    status: 409,
  });
  await api("/duties/today", { status: 401 });
  checks.push(
    "UI completion and refresh synchronized across two sessions",
    "duplicate completion 409, anonymous API 401, API no-store",
  );

  phase = "PWA";
  await a.waitForFunction(
    () => "serviceWorker" in navigator && window.isSecureContext,
  );
  await a.evaluate(async () => {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("service worker readiness timeout")),
          20000,
        ),
      ),
    ]);
  });
  await a.reload();
  await a.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const manifestPath = await a
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  const manifestUrl = new URL(manifestPath, input.baseUrl);
  assert.equal(manifestUrl.origin, input.baseUrl);
  const manifestHeaders = input.serviceToken
    ? { [platformHeader]: `Bearer ${input.serviceToken}` }
    : {};
  const manifestResponse = await fetch(manifestUrl, {
    headers: manifestHeaders,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(manifestResponse.status, 200);
  assert.equal((await manifestResponse.json()).display, "standalone");
  const cachedPaths = await a.evaluate(async () => {
    const paths = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys())
        paths.push(new URL(request.url).pathname);
    }
    return paths;
  });
  assert(
    !cachedPaths.some((pathname) => privateApi.test(pathname)),
    "private API found in static caches",
  );
  evidence.staticCacheEntries = cachedPaths.length;
  checks.push(
    "HTTPS, service worker registration/control after reload, standalone manifest, no private API in cache",
  );

  phase = "mobile_layout";
  for (const pathname of [
    "/",
    "/dorm",
    "/schedule",
    "/history",
    "/profile",
    "/messages",
  ]) {
    await a.goto(input.baseUrl + pathname);
    await a.locator("main.page").waitFor();
    await a.locator(".page-loading").waitFor({ state: "hidden" });
    await a.locator(".error-panel").waitFor({ state: "hidden" });
    const dimensions = await a.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    if (dimensions.scroll > dimensions.client)
      overflow.push({ pathname, ...dimensions });
    if (pathname === "/")
      await a.screenshot({ path: path.join(output, "hosted-home-390.png") });
  }
  assert.deepEqual(overflow, [], "mobile horizontal overflow");
  assert.deepEqual(runtimeErrors, [], "browser runtime errors");
  checks.push("six mobile pages without overflow or pageerror");
  Object.assign(evidence, {
    status: "passed",
    checks,
    runtimeErrors,
    overflow,
  });
} catch (error) {
  Object.assign(evidence, {
    status: "failed",
    phase,
    reason: sanitized(error.message || error.name || "unknown_failure"),
    checks,
    runtimeErrors,
    overflow,
  });
  process.exitCode = 1;
} finally {
  await browser?.close();
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(
    path.join(output, "hosted-smoke.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
}
