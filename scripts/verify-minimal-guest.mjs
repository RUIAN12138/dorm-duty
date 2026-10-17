import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../frontend/node_modules/@playwright/test/index.mjs";

// Usage: BASE_URL=https://your-site node scripts/verify-minimal-guest.mjs
// This creates only uniquely named, isolated QA accounts and dormitories.
// Passwords and business tokens remain in memory and never enter evidence.
const rawBase = process.env.BASE_URL || process.argv[2];
assert(rawBase, "BASE_URL or the first argument is required");
const parsedBase = new URL(rawBase);
assert(["http:", "https:"].includes(parsedBase.protocol));
assert(
  !parsedBase.username && !parsedBase.password,
  "URL credentials are prohibited",
);
assert(parsedBase.pathname === "/" && !parsedBase.search && !parsedBase.hash);
const baseUrl = parsedBase.origin;
const output = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../docs/evidence/guest-change",
  parsedBase.hostname === "127.0.0.1" || parsedBase.hostname === "localhost"
    ? "local"
    : "hosted",
);
const suffix = `${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
const secrets = [];
const checks = [];
const errors = [];
const overflows = [];
const requests = [];
const evidence = {
  date: new Date().toISOString(),
  baseUrl,
  browser: "Chrome headless, mobile emulation",
  physicalIphone: "not tested",
  push: "not tested",
};
let browser;
let phase = "fixture_setup";

function safe(message) {
  let result = String(message);
  for (const secret of secrets)
    if (secret) result = result.split(secret).join("[redacted]");
  return result
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .split("\n")[0]
    .slice(0, 400);
}

function addDays(day, days) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function api(
  route,
  { token, method = "GET", data, status = 200, noStore = false } = {},
) {
  const url = new URL(route, baseUrl);
  assert.equal(url.origin, baseUrl, "cross-origin API request prohibited");
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (data !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(url, {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(
    response.status,
    status,
    `${url.pathname}: unexpected HTTP ${response.status}`,
  );
  assert(
    /json/i.test(response.headers.get("content-type") || ""),
    `${url.pathname}: expected JSON; public Sites access must not redirect to identity login`,
  );
  if (noStore)
    assert(
      /(?:^|,)\s*no-store\b/i.test(response.headers.get("cache-control") || ""),
      `${url.pathname}: missing no-store`,
    );
  return response.json();
}

async function account(label, nickname) {
  const username = `guestqa_${label}_${suffix}`;
  const password = randomBytes(18).toString("base64url");
  secrets.push(password);
  await api("/auth/register", {
    method: "POST",
    status: 201,
    data: { username, password, nickname },
  });
  const auth = await api("/auth/login", {
    method: "POST",
    data: { username, password },
  });
  secrets.push(auth.access_token);
  const user = await api("/auth/me", { token: auth.access_token });
  return { ...user, token: auth.access_token, username, password };
}

function guestUrl(code) {
  return `${baseUrl}/?invite_code=${encodeURIComponent(code)}`;
}

async function pageFor({
  width = 390,
  colorScheme = "light",
  reducedMotion = "no-preference",
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme,
    reducedMotion,
  });
  context.setDefaultTimeout(20000);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(safe(error.message)));
  page.on("request", (request) => {
    if (
      new URL(request.url()).origin === baseUrl &&
      /^\/guest\//.test(new URL(request.url()).pathname)
    ) {
      requests.push({
        path: new URL(request.url()).pathname,
        authorized: Boolean(request.headers().authorization),
      });
    }
  });
  return page;
}

async function gotoGuest(page, code) {
  const response = await page.goto(guestUrl(code));
  assert(
    response && response.status() === 200,
    "guest entry must return 200 without platform login",
  );
  assert.equal(
    new URL(page.url()).origin,
    baseUrl,
    "guest entry redirected to identity provider",
  );
  assert(
    !/\/(?:admin\/)?login\b/.test(new URL(page.url()).pathname),
    "guest entry redirected to login",
  );
  await page.locator(".guest-chooser").waitFor();
}

async function selectMember(page, member) {
  const change = page.getByTestId("guest-change-member");
  if (await change.isVisible()) await change.click();
  await page.getByTestId(`guest-member-${member.id}`).click();
}

async function assertTaskText(page, testId, expected) {
  const card = page.getByTestId(testId);
  await card.waitFor();
  const visibleItems = await card
    .locator(".guest-task-list li > span:last-child")
    .allTextContents();
  const expectedItems = expected
    .split(/[\n、，,；;]/)
    .map((item) => item.trim())
    .filter(Boolean);
  assert.deepEqual(
    visibleItems.map((item) => item.trim()),
    expectedItems,
    "task content changed or lost in mobile list",
  );
}

async function assertMinimal(page) {
  assert.equal(
    await page.locator('input[type="password"]').count(),
    0,
    "password login must not appear on guest homepage",
  );
  assert.equal(
    await page.locator(".bottom-nav").count(),
    0,
    "dashboard tab bar must not appear on guest homepage",
  );
  assert.equal(
    await page
      .getByRole("button", { name: /完成值日打卡|补打卡|立即打卡/ })
      .count(),
    0,
    "anonymous viewing must not offer duty completion",
  );
  assert.equal(
    await page.locator(".calendar-grid, .stats-grid, .stat-grid").count(),
    0,
    "calendar and statistics must not appear on guest homepage",
  );
  const credentials = await page.evaluate(() => ({
    local: localStorage.getItem("dorm-token"),
    session: sessionStorage.getItem("dorm-token"),
    owner: localStorage.getItem("dorm-owner-token"),
  }));
  assert(
    !credentials.local && !credentials.session && !credentials.owner,
    "member selection must not manufacture a business login token",
  );
}

async function assertWidth(page, label) {
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  if (dimensions.scroll > dimensions.client)
    overflows.push({ label, ...dimensions });
  assert(
    dimensions.scroll <= dimensions.client,
    `${label}: horizontal overflow`,
  );
}

try {
  await fs.mkdir(output, { recursive: true });
  const health = await api("/health");
  const today = new Date(new Date(health.time).getTime() + 8 * 3600_000)
    .toISOString()
    .slice(0, 10);
  const duplicateName = "这是一位昵称很长而且与另一位室友重名的验收同学".padEnd(
    32,
    "长",
  );
  const a = await account("a", duplicateName);
  const b = await account("b", duplicateName);
  const c = await account("c", "独立宿舍验收成员");
  const created = await api("/dorms", {
    token: a.token,
    method: "POST",
    status: 201,
    data: { name: `免登录验收宿舍_${suffix}_较长名称用于手机折行测试` },
  });
  await api("/dorms/join", {
    token: b.token,
    method: "POST",
    data: { invite_code: created.invite_code },
  });
  const empty = await api("/dorms", {
    token: c.token,
    method: "POST",
    status: 201,
    data: { name: `空任务验收_${suffix}` },
  });
  const current = await api("/dorms/current", { token: a.token });
  const taskText = `今日本人任务_${suffix}：清扫宿舍公共区域，擦拭书桌和窗台，整理共用物品，将垃圾分类后带至楼下垃圾站，再检查阳台与洗漱区域。重复检查是否有遗漏，保持过道通畅。`;
  await api("/dorms/current", {
    token: a.token,
    method: "PATCH",
    data: {
      expected_version: current.schedule_version,
      rotation_order: [a.id, b.id],
      rotation_start_date: today,
      task_text: taskText,
      deadline_time: "23:59",
    },
  });
  const configured = await api("/dorms/current", { token: a.token });
  const generated = await api("/duties/generate", {
    token: a.token,
    method: "POST",
    data: {
      expected_version: configured.schedule_version,
      start_date: today,
      days: 30,
    },
  });
  const list = await api(
    `/duties?start_date=${today}&end_date=${addDays(today, 29)}&page_size=100`,
    { token: a.token },
  );
  assert.equal(list.items.length, 30, "expected 30 daily tasks");
  const todayTask = list.items.find((task) => task.duty_date === today);
  assert.equal(todayTask.assignee_id, a.id);
  const nextB = list.items
    .filter((task) => task.assignee_id === b.id && task.duty_date > today)
    .sort((x, y) => x.duty_date.localeCompare(y.duty_date))[0];
  const nextText = `即将到来本人任务_${suffix}：整理阳台与洗漱区`;
  await api(`/duties/${nextB.id}`, {
    token: a.token,
    method: "PATCH",
    data: {
      expected_version: generated.schedule_version,
      task_text: nextText,
    },
  });
  evidence.fixture = {
    dormId: created.id,
    emptyDormId: empty.id,
    memberIds: [a.id, b.id],
    date: today,
    expectedUpcomingDate: nextB.duty_date,
  };
  checks.push(
    "isolated random two-member dorm with duplicate long nicknames, long today task and 30-day schedule",
  );

  phase = "guest_API_isolation";
  const room = await api(`/guest/dorm?invite_code=${created.invite_code}`, {
    noStore: true,
  });
  assert.equal(room.id, created.id);
  assert.deepEqual(
    room.members.map((member) => member.user_id),
    [a.id, b.id],
  );
  assert.deepEqual(Object.keys(room).sort(), ["id", "members", "name"]);
  for (const member of room.members)
    assert.deepEqual(Object.keys(member).sort(), ["nickname", "user_id"]);
  const guestA = await api(
    `/guest/tasks?invite_code=${created.invite_code}&member_id=${a.id}`,
    { noStore: true },
  );
  const guestB = await api(
    `/guest/tasks?invite_code=${created.invite_code}&member_id=${b.id}`,
    { noStore: true },
  );
  assert.equal(guestA.today, today);
  assert.equal(guestA.today_task.assignee_id, a.id);
  assert.equal(guestA.today_task.task_text, taskText);
  assert.equal(guestA.today_task.can_complete, false);
  assert.equal(guestB.today_task, null);
  assert.equal(guestB.next_task.id, nextB.id);
  assert.equal(guestB.next_task.can_complete, false);
  await api(
    `/guest/tasks?invite_code=${created.invite_code}&member_id=${c.id}`,
    { status: 404, noStore: true },
  );
  await api("/guest/dorm?invite_code=INVALID1234", {
    status: 404,
    noStore: true,
  });
  await api(`/guest/tasks?invite_code=${created.invite_code}&member_id=0`, {
    status: 422,
    noStore: true,
  });
  await api(`/duties/${todayTask.id}/complete`, {
    method: "PATCH",
    status: 401,
  });
  await api("/dorms", {
    method: "POST",
    data: { name: "must_not_be_created" },
    status: 401,
  });
  checks.push(
    "anonymous guest APIs expose scoped viewing data only, no-store, no completion permission, invalid/member isolation 404, anonymous writes 401",
  );

  phase = "mobile_guest_UI";
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const firstVisit = await pageFor();
  const entryResponse = await firstVisit.goto(baseUrl + "/");
  assert.equal(
    entryResponse?.status(),
    200,
    "fresh entry must be accessible without platform sign-in",
  );
  assert.equal(new URL(firstVisit.url()).origin, baseUrl);
  await firstVisit.getByTestId("guest-join-dorm").waitFor();
  assert.equal(
    await firstVisit.locator(".guest-chooser").count(),
    0,
    "first visit must not silently select the demo dorm",
  );
  await firstVisit.getByTestId("guest-demo-entry").waitFor();
  await assertMinimal(firstVisit);
  await firstVisit.screenshot({
    path: path.join(output, "first-entry-390-light.png"),
  });
  await firstVisit.getByTestId("guest-demo-entry").click();
  await firstVisit.getByTestId("guest-demo-mode").waitFor();
  const demoPicker = firstVisit.locator(".guest-chooser");
  await demoPicker.waitFor();
  const demoButtons = demoPicker.locator('[data-testid^="guest-member-"]');
  assert.equal(
    await demoButtons.count(),
    6,
    "guest experience must clearly present the six-person sample dorm",
  );
  const demoMemberId = Number(
    (await demoButtons.first().getAttribute("data-testid")).replace(
      "guest-member-",
      "",
    ),
  );
  await demoButtons.first().click();
  await firstVisit.getByTestId("guest-change-member").waitFor();
  await firstVisit.reload();
  await firstVisit.getByTestId("guest-demo-mode").waitFor();
  await firstVisit.getByTestId("guest-change-member").waitFor();
  // A pre-change storage record with no explicit demo choice must not regain
  // default-room access merely because it remembers a numeric member id.
  await firstVisit.evaluate((memberId) => {
    localStorage.setItem(
      "dorm-guest-view-v1",
      JSON.stringify({ invite_code: "", member_id: memberId }),
    );
  }, demoMemberId);
  await firstVisit.reload();
  await firstVisit.getByTestId("guest-join-dorm").waitFor();
  assert.equal(await firstVisit.locator(".guest-chooser").count(), 0);
  assert.equal(await firstVisit.getByTestId("guest-demo-mode").count(), 0);
  await firstVisit.getByTestId("guest-join-dorm").click();
  await firstVisit.getByPlaceholder("输入邀请码").fill(created.invite_code);
  await firstVisit
    .getByRole("button", { name: "加入并选择室友", exact: true })
    .click();
  await firstVisit.locator(".guest-chooser").waitFor();
  assert.equal(
    await firstVisit.getByTestId("guest-demo-mode").count(),
    0,
    "formal invitation must not be labeled as demo",
  );
  await selectMember(firstVisit, b);
  await assertTaskText(firstVisit, "guest-task-next", nextText);
  checks.push(
    "fresh entry starts with join/create options; demo requires a click, stays labeled after reload, old no-code storage cannot silently restore demo, invitation form enters real dorm",
  );

  const page = await pageFor();
  await gotoGuest(page, created.invite_code);
  const choices = page.locator(".guest-chooser");
  assert.equal(
    await choices.getByRole("button").count(),
    2,
    "duplicate nicknames must remain separate choices",
  );
  await assertMinimal(page);
  await assertWidth(page, "390 member selection");
  await page.screenshot({
    path: path.join(output, "member-picker-390-light.png"),
  });
  await selectMember(page, a);
  await page.getByTestId("guest-task-today").waitFor();
  await assertTaskText(page, "guest-task-today", taskText);
  assert.equal(
    await page.getByTestId("guest-task-next").count(),
    0,
    "when today exists, homepage must show only today",
  );
  assert.equal(
    await page.getByText(nextText, { exact: true }).count(),
    0,
    "must not display another member's future task",
  );
  await assertMinimal(page);
  await page.reload();
  await page.getByTestId("guest-task-today").waitFor();
  await assertTaskText(page, "guest-task-today", taskText);
  await selectMember(page, b);
  await page.getByTestId("guest-task-next").waitFor();
  await assertTaskText(page, "guest-task-next", nextText);
  assert.equal(await page.getByTestId("guest-task-today").count(), 0);
  assert.equal(
    await page.getByText(`今日本人任务_${suffix}`, { exact: false }).count(),
    0,
    "must not display another member's today task",
  );
  await page.reload();
  await page.getByTestId("guest-task-next").waitFor();
  await assertMinimal(page);
  await page.screenshot({
    path: path.join(output, "upcoming-task-390-light.png"),
  });
  checks.push(
    "public browser entry has no platform or business login, duplicate choices stay distinct, today-only and next-only states, selection survives refresh and switches correctly",
  );

  phase = "anonymous_creation_and_owner_management";
  const creator = await pageFor();
  await creator.goto(baseUrl + "/");
  await creator.getByTestId("guest-create-dorm").click();
  await creator.getByTestId("guest-create-form").waitFor();
  await creator
    .getByTestId("guest-create-name")
    .fill(`免账号创建验收_${suffix}`);
  await creator.getByTestId("guest-create-nickname").fill("免账号创建人");
  await creator
    .getByTestId("guest-create-members")
    .fill("邀请室友甲\n邀请室友乙");
  await assertWidth(creator, "390 anonymous create form");
  const creationResponse = creator.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/guest/create" &&
      response.request().method() === "POST",
  );
  await creator.getByTestId("guest-create-submit").click();
  const createdReply = await creationResponse;
  assert.equal(
    createdReply.status(),
    201,
    "anonymous creation must create a real dorm",
  );
  const uiCreated = await createdReply.json();
  assert(uiCreated.access_token);
  secrets.push(uiCreated.access_token);
  await creator.getByTestId("guest-created-invite").waitFor();
  const uiInvite = (
    await creator
      .getByTestId("guest-created-invite")
      .locator("code")
      .innerText()
  ).trim();
  assert.equal(uiInvite, uiCreated.invite_code);
  assert.equal(
    new URL(creator.url()).searchParams.get("invite_code"),
    uiInvite,
  );
  assert.equal(await creator.locator('input[type="password"]').count(), 0);
  const ownerStorage = await creator.evaluate(() => ({
    session: sessionStorage.getItem("dorm-token"),
    owner: localStorage.getItem("dorm-owner-token"),
  }));
  assert.equal(ownerStorage.session, uiCreated.access_token);
  assert.equal(ownerStorage.owner, uiCreated.access_token);
  const viewer = await pageFor();
  await viewer.goto(baseUrl + "/");
  await viewer.getByTestId("guest-join-dorm").click();
  await viewer.getByPlaceholder("输入邀请码").fill(uiInvite);
  await viewer
    .getByRole("button", { name: "加入并选择室友", exact: true })
    .click();
  await viewer.locator(".guest-chooser").waitFor();
  const invitedMember = uiCreated.dorm.members.find(
    (member) => member.user_id !== uiCreated.member_id,
  );
  await selectMember(viewer, { id: invitedMember.user_id });
  await viewer.getByTestId("guest-task-next").waitFor();
  await assertMinimal(viewer);
  await creator.goto(baseUrl + "/dorm");
  assert(
    !creator.url().includes("login"),
    "creator must open management without an account login",
  );
  await creator.getByRole("button", { name: "自定义排班与任务" }).waitFor();
  const ownerTask = `免账号管理自定义任务_${suffix}：擦拭公共桌面`;
  await creator
    .getByPlaceholder("每行一个任务，例如扫地、拖地、倒垃圾")
    .fill(ownerTask);
  const savedResponse = creator.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/dorms/current" &&
      response.request().method() === "PATCH",
  );
  await creator
    .getByRole("button", { name: "保存规则并更新未来排班", exact: true })
    .click();
  await creator
    .getByRole("dialog")
    .getByRole("button", { name: "确认", exact: true })
    .click();
  assert.equal((await savedResponse).status(), 200);
  assert.equal(
    (await api("/dorms/current", { token: uiCreated.access_token })).task_text,
    ownerTask,
  );
  await viewer.reload();
  await assertTaskText(viewer, "guest-task-next", ownerTask);
  await api("/dorms/current", {
    method: "PATCH",
    status: 401,
    data: { expected_version: 1, task_text: "anonymous member must not write" },
  });
  await creator.evaluate(() => sessionStorage.removeItem("dorm-token"));
  await creator.reload();
  await creator.getByRole("button", { name: "自定义排班与任务" }).waitFor();
  assert(
    !creator.url().includes("login"),
    "creator ownership should recover from its saved device token",
  );
  evidence.anonymousCreatedDormId = uiCreated.dorm.id;
  checks.push(
    "first-visit real anonymous creation, invitation viewed on a second independent device context, creator can save custom schedule without password login, viewer cannot write, creator device token recovers after session reset",
  );

  phase = "layout_themes_motion";
  for (const width of [320, 390, 430]) {
    for (const colorScheme of ["light", "dark"]) {
      const themed = await pageFor({
        width,
        colorScheme,
        reducedMotion: "reduce",
      });
      await gotoGuest(themed, created.invite_code);
      await assertWidth(themed, `${width} ${colorScheme} member selection`);
      await selectMember(themed, a);
      await themed.getByTestId("guest-task-today").waitFor();
      await assertWidth(themed, `${width} ${colorScheme} long today task`);
      await assertMinimal(themed);
      if (width === 390)
        await themed.screenshot({
          path: path.join(output, `today-task-390-${colorScheme}.png`),
        });
      const styles = await themed.evaluate(() => ({
        scheme: getComputedStyle(document.documentElement).colorScheme,
        background: getComputedStyle(document.body).backgroundColor,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      }));
      assert(styles.reducedMotion);
      const coloredGuestElements = await themed
        .locator("main.guest-page")
        .evaluate((main) => {
          const colored = [];
          for (const element of [main, ...main.querySelectorAll("*")]) {
            const style = getComputedStyle(element);
            for (const key of ["color", "backgroundColor", "borderTopColor"]) {
              const match = style[key].match(
                /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/,
              );
              if (
                match &&
                (match[4] === undefined || Number(match[4]) > 0) &&
                (match[1] !== match[2] || match[2] !== match[3])
              )
                colored.push({
                  tag: element.tagName,
                  property: key,
                  value: style[key],
                });
            }
          }
          return colored;
        });
      assert.deepEqual(
        coloredGuestElements,
        [],
        "guest homepage must use only black, white and neutral gray colors",
      );
      evidence.themes ??= [];
      evidence.themes.push({ width, requestedScheme: colorScheme, ...styles });
      await themed.context().close();
    }
  }
  checks.push(
    "320/390/430 mobile layouts with long names/tasks, light/dark preference and reduced-motion context without overflow",
  );

  phase = "empty_invalid_legacy_entry";
  const emptyGuest = await api(
    `/guest/tasks?invite_code=${empty.invite_code}&member_id=${c.id}`,
    { noStore: true },
  );
  assert.equal(emptyGuest.today_task, null);
  assert.equal(emptyGuest.next_task, null);
  const emptyPage = page;
  await emptyPage.getByTestId("guest-change-dorm").click();
  await emptyPage.getByPlaceholder("输入邀请码").fill(empty.invite_code);
  await emptyPage
    .getByRole("button", { name: "加入并选择室友", exact: true })
    .click();
  await emptyPage.locator(".guest-chooser").waitFor();
  assert(
    new URL(emptyPage.url()).searchParams.get("invite_code") ===
      empty.invite_code,
    "dorm switch must update the shareable invitation URL",
  );
  await selectMember(emptyPage, c);
  await emptyPage.getByTestId("guest-empty").waitFor();
  await assertWidth(emptyPage, "390 no today/no future tasks");
  await assertMinimal(emptyPage);
  await emptyPage.screenshot({
    path: path.join(output, "no-task-390-light.png"),
  });
  await emptyPage.goto(guestUrl("INVALID1234"));
  await emptyPage.getByText(/邀请码无效|邀请码已失效/).waitFor();
  assert.equal(await emptyPage.locator(".guest-chooser").count(), 0);
  await page.goto(baseUrl + "/login?next=/");
  await page.waitForURL((url) => url.pathname === "/");
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  const admin = await pageFor();
  await admin.goto(baseUrl + "/admin/login");
  await admin.locator('input[type="password"]').waitFor();
  await admin.getByPlaceholder("3–32 位字母、数字或下划线").fill(a.username);
  await admin.getByPlaceholder("至少 8 位").fill(a.password);
  await admin
    .getByRole("button", { name: "登录管理账号", exact: true })
    .click();
  await admin.waitForURL((url) => url.pathname === "/dorm");
  await admin.getByRole("button", { name: "自定义排班与任务" }).waitFor();
  await admin.getByText(created.invite_code, { exact: true }).waitFor();
  await gotoGuest(admin, created.invite_code);
  await selectMember(admin, b);
  await admin.getByTestId("guest-task-next").waitFor();
  assert.equal(
    await admin.locator(".bottom-nav").count(),
    0,
    "even an authenticated administrator sees the minimal guest homepage",
  );

  checks.push(
    "no-today/no-future empty state, invalid invite does not fall back to another dorm, old /login redirects to guest, authenticated management entry preserved",
  );

  phase = "guest_privacy_and_runtime";
  assert(requests.length > 0);
  assert(
    requests.every((request) => !request.authorized),
    "anonymous page leaked business authorization to guest API",
  );
  const cachePaths = await page.evaluate(async () => {
    const paths = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        paths.push(new URL(request.url).pathname);
    return paths;
  });
  assert(
    !cachePaths.some((pathname) => /^\/guest\//.test(pathname)),
    "guest member/task data entered PWA static cache",
  );
  assert.deepEqual(errors, [], "browser pageerror");
  assert.deepEqual(overflows, [], "mobile horizontal overflow");
  checks.push(
    "no guest Authorization header, no guest API data in PWA cache, no browser pageerror",
  );
  Object.assign(evidence, { status: "passed", checks, errors, overflows });
} catch (error) {
  Object.assign(evidence, {
    status: "failed",
    phase,
    reason: safe(error.message || error.name),
    checks,
    errors,
    overflows,
  });
  process.exitCode = 1;
} finally {
  await browser?.close();
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(
    path.join(output, "guest-smoke.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
}
