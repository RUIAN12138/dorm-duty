import assert from "node:assert/strict";
import {
  chromium,
  webkit,
} from "../../../node_modules/@playwright/test/index.mjs";
import { createHarness } from "../../../../site/scripts/check-cloud-backend.mjs";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const base = process.env.DORM_WIZARD_ORIGIN || "http://127.0.0.1:8119";
const b = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "chromium"
    ? {
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }
    : {},
);
const context = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  serviceWorkers: "block",
});
const p = await context.newPage();
p.setDefaultTimeout(12000);
const h = await createHarness();
const errors = [],
  writes = [];
const room = await (
  await h.request("/guest/create", {
    method: "POST",
    data: { name: "催促界面隔离", nickname: "甲", members: ["乙", "丙"] },
  })
).json();
const peer = await (
  await h.request("/chores/claim", {
    method: "POST",
    data: { invite_code: room.invite_code, nickname: "乙" },
  })
).json();
const identity = {
  id: room.dorm.id,
  name: room.dorm.name,
  invite_code: room.invite_code,
  member_id: peer.member.user_id,
  nickname: "乙",
  is_creator: false,
};
await p.addInitScript(
  ({ invite, id }) =>
    localStorage.setItem(
      `dorm-welcome-guide-v2:${encodeURIComponent(invite)}:${id}`,
      "1",
    ),
  { invite: room.invite_code, id: peer.member.user_id },
);
await p.route(/\/(email|chores|auth|dorms|guest)\//, async (route) => {
  const req = route.request(),
    url = new URL(req.url());
  if (url.pathname === "/chores/companion/state")
    return route.fulfill({
      json: {
        available: true,
        voice_available: false,
        messages: [],
        reminders: [],
      },
    });
  if (url.pathname.startsWith("/email/"))
    return route.fulfill({
      json:
        url.pathname === "/email/config"
          ? { available: true, registration_required: true }
          : url.pathname === "/email/me"
            ? {
                logged_in: true,
                email: "nudge@example.invalid",
                rooms: [identity],
              }
            : url.pathname === "/email/enter"
              ? { ...identity, access_token: peer.access_token }
              : {},
    });
  if (url.pathname === "/chores/push/config")
    return route.fulfill({ json: { available: false } });
  if (req.method() !== "GET")
    writes.push({ path: url.pathname, body: req.postDataJSON() });
  const response = await h.request(url.pathname + url.search, {
    method: req.method(),
    token: req.headers().authorization?.replace(/^Bearer /, ""),
    ...(req.postData() ? { data: req.postDataJSON() } : {}),
  });
  const body = await response.text();
  await route.fulfill({
    status: response.status,
    contentType: "application/json",
    body,
  });
});
p.on("pageerror", (e) => errors.push(e.message));

async function blankPoint() {
  return p.evaluate(() => {
    const stage = document.querySelector(".content-stage.is-signed-in");
    for (let y = 220; y < Math.min(innerHeight - 140, 720); y += 30)
      for (const x of [200, 150, 240]) {
        const el = document.elementFromPoint(x, y);
        if (
          stage?.contains(el) &&
          el.matches("div,section,header,main,article,.identity-name") &&
          !el.closest(
            "button,a,input,textarea,select,[role=tablist],[role=slider],[contenteditable=true],.calendar-surface,.task-title-stage,.water-title-stage,.task-selector,.completion-surface,.round-progress,.companion-frame,.stats-mode,.deck-stage,[role=button],[draggable=true],[data-sheet-scroll],[data-page-gesture],[data-native-scroll]",
          )
        )
          return { x, y };
      }
  });
}
async function drag(dx, dy = 0, touch = false) {
  await p.waitForFunction(
    () =>
      !document
        .querySelector(".board-focus")
        ?.getAnimations({ subtree: true })
        .some(
          (a) =>
            a.playState === "running" &&
            a.effect?.getTiming().iterations !== Infinity,
        ),
  );
  const point = await blankPoint();
  assert.ok(point, "visible blank gesture area");
  if (touch) {
    const cdp = await context.newCDPSession(p);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: point.x + (dx * i) / 8, y: point.y + (dy * i) / 8 }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  } else {
    await p.mouse.move(point.x, point.y);
    await p.mouse.down();
    await p.mouse.move(point.x + dx, point.y + dy, { steps: 8 });
    await p.mouse.up();
  }
}
try {
  await p.goto(base + "/?start=1");
  await p.getByTestId("pane-duty").waitFor();
  assert.equal(await p.locator(".content-stage.is-signed-in").count(), 1);
  await drag(-110, 0, engine === "chromium");
  await p.waitForURL("**/water");
  await p.getByTestId("pane-water").waitFor();
  assert(
    await p
      .getByTestId("nav-water")
      .evaluate((el) => el.classList.contains("active")),
    "bottom navigation follows page",
  );
  await drag(-110);
  await p.waitForURL("**/calendar");
  await p.getByTestId("pane-calendar").waitFor();
  assert(
    await p
      .getByTestId("nav-calendar")
      .evaluate((el) => el.classList.contains("active")),
  );
  await drag(110);
  await p.waitForURL("**/water");
  await drag(0, 110);
  assert.equal(
    new URL(p.url()).pathname,
    "/water",
    "vertical drag does not navigate",
  );
  const before = writes.length;
  const hero = p.getByTestId("nudge-task-swipe"),
    r = await hero.boundingBox();
  await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await p.mouse.down();
  await p.mouse.move(r.x + r.width / 2 - 100, r.y + r.height / 2, { steps: 8 });
  await p.mouse.up();
  assert.equal(
    new URL(p.url()).pathname,
    "/water",
    "nudge title retains its own gesture",
  );
  assert.equal(
    writes.length,
    before,
    "swiping sends no notification or completion",
  );
  await p.locator('.nudge-title-window[data-task-key="floor"]').waitFor();
  await p.locator(".nudge-detail").click();
  const sheet = p.locator(".sheet-layer .elastic-sheet");
  await sheet.waitFor();
  const box = await sheet.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2, {
    steps: 8,
  });
  await p.mouse.up();
  assert.equal(
    new URL(p.url()).pathname,
    "/water",
    "drawer gestures do not navigate the page",
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${engine}: blank swipes navigate with synchronized nav; vertical and title gestures remain scoped`,
  );
} finally {
  await context.close();
  await b.close();
  h.close();
}
