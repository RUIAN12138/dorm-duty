// Real Vue controls with ephemeral practice data. No production access.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "../frontend/node_modules/@playwright/test/index.mjs";
import { createHarness } from "../site/scripts/check-cloud-backend.mjs";
const origin = process.env.DORM_GUIDE_ORIGIN || "http://127.0.0.1:8098";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const evidence = path.resolve(`data/auto-tutorial/${engine}`);
await fs.mkdir(evidence, { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch({
  ...(engine === "chromium" && process.platform === "darwin" ? { executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" } : {}),
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: "block", recordVideo: { dir: path.join(evidence, "video"), size: { width: 390, height: 844 } } });
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [], requests = [], checks = [];
let liveHarness;
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (req) => {
  if (["fetch", "xhr"].includes(req.resourceType())) requests.push(req.url());
});
function check(value, message) { assert.ok(value, message); checks.push(message); }
async function settleCoach() {
  await page.waitForFunction(() => {
    const coach = document.querySelector(".practice-coach");
    const light = coach?.querySelector(".practice-light"), note = coach?.querySelector(".practice-note");
    if (!coach || !light || !note || coach.getAnimations({subtree:true}).some(a=>a.playState==="running" && a.effect?.getTiming().iterations !== Infinity && !a.effect?.target?.closest?.(".dorm-companion"))) {
      window.__practiceStable = null; return false;
    }
    const key = JSON.stringify([light.getBoundingClientRect().toJSON(), note.getBoundingClientRect().toJSON(), coach.dataset.step]);
    const prior = window.__practiceStable;
    window.__practiceStable = { key, frames: prior?.key===key ? prior.frames+1 : 0 };
    return window.__practiceStable.frames >= 3;
  });
}
async function act(id, operation) {
  await page.waitForFunction((id) => document.querySelector('[data-testid=practice-coach]')?.getAttribute("data-step") === id, id);
  if (operation) await operation();
  await page.waitForFunction((id) => {
    const coach = document.querySelector('[data-testid=practice-coach]');
    return !coach || coach.getAttribute("data-step") !== id;
  }, id);
  check(true, `${id}: actual operation automatically advances exactly once`);
}
async function swipeTitle(dx, dy) {
  const rect = await page.getByTestId('nudge-task-swipe').boundingBox();
  assert.ok(rect, 'the real nudge title is present');
  const x=rect.x+rect.width/2, y=rect.y+rect.height/2;
  await page.mouse.move(x,y); await page.mouse.down();
  await page.mouse.move(x+dx,y+dy,{steps:8}); await page.mouse.up();
}

try {
  await page.goto(`${origin}/guide?practice=1`);
  await page.getByTestId("lesson-duty").waitFor();
  const baseline = requests.length;
  await page.screenshot({ path: path.join(evidence, "directory.png") });
  await page.getByTestId("lesson-duty").click();
  await settleCoach();
  check(await page.locator(".practice-next").count()===0, "no extra Continue button is needed for any operation");
  check(await page.locator(".practice-note .dorm-companion").count()===1, "the existing companion narrates above the current operation");
  check(await page.getByTestId("practice-coach").getAttribute("data-step")==="duty-select", "without an operation the tutorial stays on its current step");
  await page.waitForFunction(() => {
    const target=document.querySelector(".task-selector button:nth-child(2)"), r=target?.getBoundingClientRect();
    return r && document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest("button")===target;
  });
  await settleCoach();
  await page.screenshot({ path: path.join(evidence, "duty-step.png") });
  await page.evaluate(() => {
    const dialog = document.createElement("div");
    dialog.id = "practice-external-dialog"; dialog.setAttribute("role","dialog");
    dialog.style.cssText = "position:fixed;inset:20px;z-index:9500;background:white";
    const button = document.createElement("button"); button.textContent="关闭全局说明";
    button.onclick=()=>dialog.remove(); dialog.append(button); document.body.append(dialog);
  });
  await page.waitForFunction(()=>getComputedStyle(document.querySelector(".practice-coach")).display==="none");
  await page.getByRole("button",{name:"关闭全局说明",exact:true}).click();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector(".practice-coach")).display!=="none");
  check(true,"global dialogs suspend the coach and retain their real close action");
  await act("duty-select", () => page.locator(".task-selector button").nth(1).click());
  await act("duty-detail", () => page.getByRole("button", { name: "查看洗手池详情", exact: true }).click());
  await act("duty-detail-close", () => page.getByRole("button", { name: "关闭详情", exact: true }).click());
  await act("duty-complete", async () => {
    await page.getByTestId("complete-sink--11").click();
    await page.waitForFunction(() => document.querySelector(".completion-surface")?.classList.contains("is-round"));
    check(true, "practice uses the original morphing completion control");
    await page.screenshot({ path: path.join(evidence, "completion-middle.png") });
  });
  await act("duty-round", () => page.getByTestId("round-progress").click());
  await act("duty-pending", () => page.locator(".round-filters button").nth(1).click());
  await act("duty-round-close", () => page.getByRole("button", { name: "关闭详情", exact: true }).click());
  await act("duty-undo", () => page.getByTestId("undo--11").click());
  await page.getByTestId("lesson-water").click();
  await act("water-nav", () => page.getByTestId("nav-water").click());
  await act("water-detail", () => page.locator(".water-task-text").click());
  await act("water-detail-close", () => page.getByRole("button", { name: "关闭详情", exact: true }).click());
  await act("water-complete", () => page.getByTestId("complete-water--13").click());
  await act("water-nudge", () => page.getByTestId("water-nudge").click());
  await act("water-swipe", () => swipeTitle(-110,0));
  await act("water-person", () => swipeTitle(0,-110));
  await page.getByTestId("lesson-calendar").click();
  await act("calendar-nav", () => page.getByTestId("nav-calendar").click());
  await act("calendar-date", () => page.locator(".chore-calendar-grid:not([inert]) button.is-today").click());
  await act("calendar-close", () => page.getByRole("button", { name: "关闭详情", exact: true }).click());
  await act("calendar-list", () => page.getByTestId("calendar-view-list").click());
  await act("calendar-stats", () => page.getByTestId("calendar-view-stats").click());
  await page.getByTestId("lesson-messages").click();
  await act("message-ball", () => page.locator(".companion-identity .companion-frame").click());
  await act("message-start", () => page.getByTestId("chat-quick-prompts").getByRole("button", { name: "我要留言", exact: true }).click());
  await act("message-recipient", () => page.locator(".conversation-recipients").getByRole("button", { name: "小林", exact: true }).click());
  await act("message-recipient-confirm", () => page.locator('.conversation-note-actions .chat-primary').click());
  await act("message-content", async () => {
    await page.getByRole("textbox", { name: "和球球说句话" }).click();
    await page.getByRole("textbox", { name: "和球球说句话" }).fill("晚点回来，我会记得值日。");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
  });
  await settleCoach();
  await page.screenshot({ path: path.join(evidence, "note-confirm.png") });
  await act("message-confirm", () => page.getByTestId("note-confirm").click());
  await act("message-back", () => page.getByRole("button", { name: "返回宿舍", exact: true }).click());
  await act("message-tools", () => page.getByTestId("open-tools").click());
  await act("message-inbox", () => page.getByTestId("open-messages").click());
  await act("message-read", () => page.getByTestId("reminder-read--50").click());
  check(await page.locator(".practice-lessons small").count() === 4, "all four practical chapters can be completed");
  check(requests.length === baseline, `all practice actions issue zero fetch/XHR (${JSON.stringify(requests.slice(baseline))})`);
  check(await page.locator(".practice-coach").count() === 0 && await page.locator(".sheet-layer:visible").count() === 0,
    "finishing a chapter clears its spotlight and portalled sheets");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByTestId("lesson-duty").click();
    await settleCoach();
    await page.waitForFunction(() => {
      const target = document.querySelector(".task-selector button:nth-child(2)");
      const r = target?.getBoundingClientRect();
      const note = document.querySelector(".practice-note")?.getBoundingClientRect();
      const nav = document.querySelector('[data-testid=chore-bottom-nav]')?.getBoundingClientRect();
      return r && note && nav && note.right <= innerWidth && innerHeight - nav.bottom < 60 &&
        document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("button") === target;
    });
    const result = await page.evaluate(() => {
      const target = document.querySelector(".task-selector button:nth-child(2)"), r = target.getBoundingClientRect();
      return { target: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("button") === target,
        note: document.querySelector(".practice-note").getBoundingClientRect().right <= innerWidth,
        navGap: innerHeight - document.querySelector('[data-testid=chore-bottom-nav]').getBoundingClientRect().bottom };
    });
    check(result.target && result.note && result.navGap < 60, `${width}px: target is clickable, coach fits, navigation stays at the bottom (${JSON.stringify(result)})`);
    await page.getByRole("button", { name: "退出本节练习，返回目录", exact: true }).click();
  }
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.getByTestId("lesson-duty").click();
  await act("duty-select", () => page.locator(".task-selector button").nth(1).click());
  await page.screenshot({ path: path.join(evidence, "dark-reduced-motion.png") });
  await page.keyboard.press("Escape");
  await page.getByTestId("lesson-duty").waitFor();
  check(await page.locator(".practice-coach").count() === 0, "Escape returns to the chapter directory without a remaining overlay");
  liveHarness = await createHarness();
  const fixture = await (await liveHarness.request('/guest/create',{method:'POST',data:{name:'引导布局隔离',nickname:'测试成员'}})).json();
  const identity = {id:fixture.dorm.id,name:fixture.dorm.name,invite_code:fixture.invite_code,member_id:fixture.member_id,nickname:'测试成员',is_creator:true};
  const live = await context.newPage();
  await live.addInitScript(({invite,id})=>localStorage.setItem(`dorm-welcome-guide-v2:${encodeURIComponent(invite)}:${id}`,'1'),{invite:fixture.invite_code,id:fixture.member_id});
  await live.route(/\/(email|chores|auth|dorms|guest)\//,async route=>{
    const req=route.request(), url=new URL(req.url());
    if(url.pathname.startsWith('/email/')) return route.fulfill({json:url.pathname==='/email/config'?{available:true,registration_required:true}:url.pathname==='/email/me'?{logged_in:true,email:'guide@example.invalid',rooms:[identity]}:url.pathname==='/email/enter'?{...identity,access_token:fixture.access_token}:{}});
    if(url.pathname==='/chores/companion/state') return route.fulfill({json:{available:true,voice_available:false,messages:[],reminders:[]}});
    if(url.pathname==='/chores/push/config') return route.fulfill({json:{available:false}});
    const response=await liveHarness.request(url.pathname+url.search,{method:req.method(),token:req.headers().authorization?.replace(/^Bearer /,''),...(req.postData()?{data:req.postDataJSON()}:{})});
    return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  });
  for (const [width, height] of [[320,568],[390,844],[430,932]]) {
    await live.setViewportSize({width,height});
    await live.goto(`${origin}/?start=1`);
    await live.getByTestId("pane-duty").waitFor();
    for (const section of ["duty","water","calendar"]) {
      if(section!=="duty") await live.getByTestId(`nav-${section}`).click();
      await live.getByTestId(`pane-${section}`).waitFor();
      await live.waitForFunction(() => document.querySelector(".screen-surface")?.getBoundingClientRect().width === innerWidth);
      const layout = await live.evaluate(() => {
        const nav=document.querySelector('[data-testid=chore-bottom-nav]').getBoundingClientRect();
        return {fullWidth: document.querySelector(".guest-page").getBoundingClientRect().width === innerWidth,
          overflow:document.documentElement.scrollWidth-innerWidth,navVisible:nav.top>=0 && nav.bottom<=innerHeight};
      });
      check(layout.fullWidth && layout.overflow<2 && layout.navVisible, `${width}x${height}: live ${section} retains full component width and visible navigation`);
      await live.screenshot({path:path.join(evidence,`layout-${section}-${width}.png`)});
    }
  }
  await live.close();
  check(errors.length === 0, `no browser errors: ${JSON.stringify(errors)}`);
  await fs.writeFile(path.join(evidence, "results.json"), JSON.stringify({ engine, checks, requests, errors }, null, 2));
  console.log(JSON.stringify({ engine, passed: checks.length, checks, evidence }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(evidence, "failure.png") }).catch(() => {});
  console.error(JSON.stringify({ error: error.message, step: await page.locator(".practice-coach").getAttribute("data-step").catch(() => null), errors, requests, checks }, null, 2));
  throw error;
} finally { await context.close(); await fs.copyFile(await page.video().path(),path.join(evidence,"practice.webm")); await browser.close(); liveHarness?.close(); }
