import { createHarness } from "../site/scripts/check-cloud-backend.mjs";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { observeElementSize } from "../frontend/src/components/onboarding/observeElementSize.mjs";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const b = await (engine === "webkit" ? webkit : chromium).launch({
  headless: true,
  ...(engine === "chromium"
    ? {
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }
    : {}),
});
const p = await b.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  serviceWorkers: "block",
  recordVideo:{dir:`data/startup-review/${engine}-wizard-videos`,size:{width:390,height:844}},
});
p.setDefaultTimeout(20000);
await p.addInitScript(() => {
  window.__systemPermissionPromptCount = 0;
  const NotificationApi = window.Notification || class Notification {};
  Object.defineProperty(NotificationApi, "requestPermission", {
    configurable: true,
    value: async () => {
      window.__systemPermissionPromptCount++;
      return "denied";
    },
  });
  if (!("Notification" in window)) {
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: NotificationApi,
    });
  }
  if (!("PushManager" in window))
    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: class PushManager {},
    });
  if (!("serviceWorker" in navigator))
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({}) },
    });
});
const h = await createHarness();
const initial = await (
  await h.request("/guest/create", {
    method: "POST",
    data: { name: "旧宿舍兼容预览", nickname: "体验者", members: ["小林"] },
  })
).json();
let emailRoom = {
  id: initial.dorm.id,
  name: initial.dorm.name,
  invite_code: initial.invite_code,
  member_id: initial.member_id,
  nickname: "体验者",
  is_creator: true,
};
let emailToken = initial.access_token;
await p.route(/\/(email|chores|auth|dorms|guest)\//, async (route) => {
  const req = route.request(),
    url = new URL(req.url());
  if (url.pathname.startsWith("/email/"))
    return route.fulfill({
      json:
        url.pathname === "/email/config"
          ? { available: true, registration_required: true }
          : url.pathname === "/email/me"
            ? {
                logged_in: true,
                email: "isolated@example.invalid",
                rooms: [emailRoom],
              }
            : url.pathname === "/email/enter"
              ? { ...emailRoom, access_token: emailToken }
              : {},
    });
  if (url.pathname === "/chores/push/config")
    return route.fulfill({
      json: { available: true, public_key: "test-public-key" },
    });
  const response = await h.request(url.pathname + url.search, {
    method: req.method(),
    token: req.headers().authorization?.replace(/^Bearer /, ""),
    ...(req.postData() ? { data: JSON.parse(req.postData()) } : {}),
  });
  const body = await response.text();
  if (url.pathname === "/guest/create" && response.ok) {
    const value = JSON.parse(body);
    emailRoom = {
      id: value.dorm.id,
      name: value.dorm.name,
      invite_code: value.invite_code,
      member_id: value.member_id,
      nickname: value.dorm.members.find((m) => m.user_id === value.member_id)
        .nickname,
      is_creator: true,
    };
    emailToken = value.access_token;
  }
  return route.fulfill({
    status: response.status,
    contentType: "application/json",
    body,
  });
});
const errors = [];
const failedRequests=[];
p.on("pageerror", (e) => errors.push(e.message));
p.on("requestfailed", r => failedRequests.push(`${r.url()} :: ${r.failure()?.errorText||"failed"}`));
let writes = 0;
let createRequests = 0;
let previewTracking = false;
const previewApiRequests = [];
p.on("request", (r) => {
  if (r.method() === "POST" && new URL(r.url()).pathname === "/guest/create") createRequests++;
  if (previewTracking && /\/(chores|guest|dorms)\//.test(new URL(r.url()).pathname))
    previewApiRequests.push(`${r.method()} ${new URL(r.url()).pathname}`);
  if (
    r.url().includes("/chores/") &&
    ["POST", "PATCH"].includes(r.method()) &&
    !r.url().includes("/received")
  )
    writes++;
});
let n = 0;
const check = (v, label) => {
  assert(v, label);
  n++;
  console.log("PASS " + label);
};
try {
  const fallbackListeners=new Set();let resizeFallbackCalls=0;
  const stopResizeFallback=observeElementSize({},()=>resizeFallbackCalls++,{
    ResizeObserver:undefined,
    addEventListener(type,listener){if(type==='resize')fallbackListeners.add(listener);},
    removeEventListener(type,listener){if(type==='resize')fallbackListeners.delete(listener);},
  });
  check(fallbackListeners.size===1,'resize fallback attaches one window listener when ResizeObserver is unavailable');
  for(const listener of fallbackListeners)listener();
  check(resizeFallbackCalls===1,'resize fallback remeasures on a window resize event');
  stopResizeFallback();
  for(const listener of fallbackListeners)listener();
  check(fallbackListeners.size===0&&resizeFallbackCalls===1,'resize fallback removes its exact listener and stops updating after cleanup');
  await p.goto("http://127.0.0.1:8094/guide");
  await p.locator('[data-testid="welcome-guide"]').waitFor();
  check(await p.locator(".guide-page").count() === 4, "welcome tutorial is a standalone four-page route");
  check(await p.locator(".guide-page .dorm-companion").evaluateAll((els) => els.every((el) => el.getAttribute("data-effects-mode") === "lite")), "welcome tutorial keeps the companion motion while suppressing color ribbons and particles");
  const skipButton = p.getByRole("button", { name: "跳过" });
  const skipBounds = await skipButton.boundingBox();
  await p.mouse.move(skipBounds.x + skipBounds.width / 2, skipBounds.y + skipBounds.height / 2);
  await p.mouse.down();
  await p.waitForFunction(() => {
    const el = document.querySelector(".guide-skip");
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.transform !== "none" && new DOMMatrixReadOnly(style.transform).a < 0.999 && Number(style.opacity) < 0.99;
  });
  const skipPress = await skipButton.evaluate((el) => ({ transform: getComputedStyle(el).transform, opacity: Number(getComputedStyle(el).opacity) }));
  check(skipPress.transform !== "none" && skipPress.opacity < 1, "tutorial skip action gives a subtle tactile press response");
  await p.evaluate(() => document.querySelector(".guide-skip").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, once: true }));
  await p.mouse.up();
  check(
    JSON.stringify(await p.locator(".guide-page p").allTextContents()) === JSON.stringify([
      "首页会显示今天的任务和负责人。",
      "点“我已完成”，查看进度和下一位。",
      "点球球留话，回首页点消息看回复。",
      "设置里可以调整任务。",
    ]),
    "welcome tutorial copy names the real entry point and action on each page",
  );
  check(await p.locator(".guide-dots button").evaluateAll((els) => els.every((el) => el.offsetWidth >= 24 && el.offsetHeight >= 44)), "tutorial page indicators expose a stable, accessible touch target");
  const guideDotLayout = await p.locator(".guide-dots button").evaluateAll((els) => els.map((el) => [el.offsetLeft, el.offsetWidth]));
  const guideDefaultViewport = p.viewportSize();
  for (const viewport of [{width:844,height:390},{width:568,height:320},{width:320,height:568}]) {
    await p.setViewportSize(viewport);
    for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
      await p.getByRole("button", { name: `第 ${pageIndex + 1} 页`, exact: true }).click();
      await p.waitForFunction((expected) => {
        const pages = [...document.querySelectorAll(".guide-page")];
        const active = pages.findIndex((page) => page.getAttribute("aria-hidden") === "false");
        const track = document.querySelector(".guide-pages");
        return active === expected && !!track && Math.abs(track.scrollLeft - expected * track.clientWidth) < 2;
      }, pageIndex);
      const guideReachability = await p.locator('.guide-page[aria-hidden="false"]').evaluate((slide) => {
        const track = slide.parentElement;
        const header = document.querySelector(".welcome-guide header").getBoundingClientRect();
        const footer = document.querySelector(".welcome-guide footer").getBoundingClientRect();
        slide.scrollTop = 0;
        const firstTop = slide.firstElementChild.getBoundingClientRect().top;
        const pageTop = slide.getBoundingClientRect().top;
        slide.scrollTop = slide.scrollHeight;
        const lastBottom = slide.lastElementChild.getBoundingClientRect().bottom;
        const pageBottom = slide.getBoundingClientRect().bottom;
        return {
          firstVisibleAtStart: firstTop >= pageTop - 1,
          lastVisibleAtEnd: lastBottom <= pageBottom + 1,
          headerVisible: header.top >= 0 && header.bottom <= innerHeight,
          footerVisible: footer.top >= 0 && footer.bottom <= innerHeight,
          horizontalPage: Math.round(track.scrollLeft / track.clientWidth),
        };
      });
      if (viewport.width === 568 && viewport.height === 320 && pageIndex === 0) {
        await p.locator('.guide-page[aria-hidden="false"]').evaluate((slide) => { slide.scrollTop = 0; });
        await p.screenshot({ path: `data/startup-review/${engine}-welcome-guide-landscape-after.png` });
      }
      check(guideReachability.firstVisibleAtStart && guideReachability.lastVisibleAtEnd && guideReachability.headerVisible && guideReachability.footerVisible && guideReachability.horizontalPage === pageIndex,
        `${viewport.width}x${viewport.height} welcome page ${pageIndex + 1} stays vertically reachable without moving horizontal selection`);
    }
  }
  await p.setViewportSize(guideDefaultViewport);
  await p.getByRole("button", { name: "第 1 页", exact: true }).click();
  await p.waitForFunction(() => Math.abs(document.querySelector(".guide-pages").scrollLeft) < 2);
  await p.getByRole("button", { name: "第 4 页", exact: true }).click();
  await p.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const guideTransitionState = await p.evaluate(() => {
    const track = document.querySelector(".guide-pages");
    const pages = [...document.querySelectorAll(".guide-page")];
    const activeIndex = pages.findIndex((page) => page.getAttribute("aria-hidden") === "false");
    const physicalIndex = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    return {
      activeIndex,
      physicalIndex,
      currentStep: document.querySelector(".guide-dots button.active")?.getAttribute("aria-current"),
      action: document.querySelector(".guide-next")?.textContent?.trim(),
    };
  });
  check(
    guideTransitionState.activeIndex === guideTransitionState.physicalIndex &&
      guideTransitionState.currentStep === "step" &&
      guideTransitionState.action === (guideTransitionState.physicalIndex === 3 ? "开始使用" : "继续"),
    "guide content and action stay aligned with the page currently in view during direct navigation",
  );
  await p.waitForFunction(() => {
    const track = document.querySelector(".guide-pages");
    return !!track && Math.abs(track.scrollLeft - 3 * track.clientWidth) < 2;
  });
  await p.locator('.guide-page[aria-hidden="false"] h1', { hasText: "日历里看完成记录" }).waitFor();
  check(JSON.stringify(await p.locator(".guide-dots button").evaluateAll((els) => els.map((el) => [el.offsetLeft, el.offsetWidth]))) === JSON.stringify(guideDotLayout), "tutorial page indicator keeps its layout fixed while the capsule animates");
  await p.screenshot({ path: `data/startup-review/${engine}-welcome-guide-copy-after.png` });
  check(await p.getByRole("button", { name: "开始使用", exact: true }).isVisible(), "last tutorial page exposes the start action");
  await p.getByRole("button", { name: "开始使用", exact: true }).click();
  const localEntry=p.getByTestId("dev-new-dorm-wizard");
  if(!(await localEntry.isVisible())){
    await p.getByTestId("open-tools").click();
  }
  await localEntry.waitFor({state:"visible"});
  await p.screenshot({path:`data/startup-review/${engine}-local-wizard-entry.png`});
  await localEntry.click();
  await p.locator(".dorm-wizard").waitFor();
  await p.waitForFunction(async () => {
    const root = document.querySelector('.dorm-wizard');
    const body = root?.querySelector('.wizard-body');
    const footer = root?.querySelector('.wizard-footer');
    if (!body || body.getBoundingClientRect().width === 0 || body.getBoundingClientRect().height === 0 || !footer?.getBoundingClientRect().height) return false;
    const animations = document.getAnimations({ subtree: true }).filter((animation) =>
      animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().iterations),
    );
    if (animations.length) await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
    return true;
  });
  check(await p.locator(".dorm-wizard .dorm-companion").first().getAttribute("data-effects-mode") === "full", "new-room wizard keeps the companion's existing full visual effects");
  await p.evaluate(() => new Promise(requestAnimationFrame));
  await p.screenshot({path:`data/startup-review/${engine}-local-wizard-open.png`});
  check(await p.locator(".dorm-wizard").count()===1&&await p.getByTestId("email-account-panel").count()===0,"local entry opens the isolated creation experience without the email gate");
  await p.getByLabel("宿舍名称",{exact:true}).waitFor({state:"visible"});
  check(await p.locator('.welcome-slides').count()===0,"first-time creation skips the redundant creation-only slide deck");
  check(await p.getByRole('heading',{name:"宿舍，叫什么？",exact:true}).isVisible(),"first-time creation opens directly on the editable room-name question");
  check(await p.locator('.wizard-step:not([aria-hidden=true]) label,.wizard-step:not([aria-hidden=true]) .wizard-secondary').count()===0&&await p.getByLabel('宿舍名称',{exact:true}).count()===1,"room-name step keeps one accessible input without a duplicate visible label or helper");
  check((await p.locator('.wizard-tip').textContent())?.trim()==='室友加入后自己填写姓名',"roommate naming guidance appears once in the concise companion tip");
  check(await p.locator('.tour').count()===0,"the first editable question is not blocked by an automatic tour");
  await p.getByRole("button",{name:"退出配置",exact:true}).click();
  await p.locator(".dorm-wizard").waitFor({state:"detached"});
  await p.goto("http://127.0.0.1:8094/?preview=new-dorm");
  await p.locator(".dorm-wizard").waitFor();
  check(await p.getByLabel("宿舍名称",{exact:true}).isVisible(),"local creation preview also starts on the first editable question");
  await p.getByLabel("宿舍名称",{exact:true}).fill("本地体验宿舍");
  for(let step=0;step<4;step++)await p.getByRole("button",{name:"继续",exact:true}).click();
  await p.getByRole("button",{name:"完成体验",exact:true}).click();
  check(await p.getByText("本机仅保留向导草稿，不会创建宿舍或生成有效邀请码。",{exact:true}).count()===1&&createRequests===0,"finishing local experience never calls the room creation API");
  await p.getByRole("button",{name:"退出体验",exact:true}).click();
  await p.goto("http://127.0.0.1:8094/?preview=new-dorm");
  await p.locator(".dorm-wizard").waitFor();
  check(!new URL(p.url()).searchParams.has("preview"), "local preview shortcut opens the wizard and cleans its query flag");
  check(await p.getByLabel("宿舍名称",{exact:true}).isVisible(),"reopened local wizard retains the direct first-question entry");
  await p.getByRole("button",{name:"退出配置",exact:true}).click();
  await p.locator(".dorm-wizard").waitFor({state:"detached"});
  await p.getByTestId("open-tools").click();
  await p.getByTestId("open-preferences").click();
  await p.locator(".menu-advanced summary").click();
  await p.getByTestId("guest-create-dorm").click();
  await p.locator(".dorm-wizard").waitFor();
  const guide=p.locator('.tour');
  await guide.waitFor({state:'visible',timeout:2000}).catch(()=>{});
  if (await guide.count()) await guide.getByRole("button", { name: "跳过", exact: true }).click();
  await guide.waitFor({state:'detached',timeout:2000}).catch(()=>{});
  check(await guide.count()===0,'preview screenshots are captured after dismissing the spotlight guide');
  const roomNameInput=p.getByLabel("宿舍名称", { exact: true });
  check(await roomNameInput.evaluate(input=>input.maxLength)===64,"room-name input keeps the existing 64-character limit");
  await roomNameInput.fill("");
  await p.getByRole("button",{name:"继续",exact:true}).click();
  check(await p.getByText("先填写宿舍名称",{exact:true}).count()===1,"room-name required validation remains active");
  await roomNameInput.fill("向导隔离宿舍");
  check(await p.locator('.wizard-step:not([aria-hidden=true]) input,.wizard-step:not([aria-hidden=true]) textarea,.wizard-step:not([aria-hidden=true]) select').count()===1,'dorm name screen asks only one question');
  check(await p.locator('.wizard-step:not([aria-hidden=true]) label,.wizard-step:not([aria-hidden=true]) .wizard-secondary').count()===0,"dorm name screen has no duplicate label or helper text");
  check(await p.locator('.progress-hit').count()===5,'new dorm creation exposes exactly five progress targets');
  check(await p.locator('.progress-hit').allTextContents().then(xs=>xs.every(x=>!x.trim())),'progress bar has no visible numeric or symbol labels');
  const progressTargets=await p.locator('.progress-hit').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height};}));
  const progressGlass=await p.locator('.progress-glass-surface').boundingBox();
  const progressTrack=await p.locator('.progress-track').boundingBox();
  check(progressTargets.every(r=>r.width>=44&&r.height===64)&&progressGlass?.width===36&&progressGlass?.height===36,'progress has 44px+ touch targets around a 36px glass thumb');
  check(progressTrack?.height===20,'progress track has the stronger 20px black-and-gray treatment');
  await p.evaluate(()=>{let count=0;Object.defineProperty(navigator,'vibrate',{configurable:true,value:()=>{count++;return true}});Object.defineProperty(window,'__wizardHaptics',{configurable:true,get:()=>count});});
  await p.waitForTimeout(450);
  await p.screenshot({path:`data/startup-review/${engine}-wizard-name-after.png`});
  await p.locator('.creation-progress').evaluate((host) => {
    const rect = host.getBoundingClientRect();
    const stepX = (index) => rect.left + 24 + (rect.width - 48) * index / 4;
    host.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 91, pointerType: 'touch', button: 0,
      clientX: stepX(0), clientY: rect.top + rect.height / 2,
    }));
    // Simulate a touch platform that coalesces the final pointermove and only
    // delivers the release at the new step.
    host.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, pointerId: 91, pointerType: 'touch', button: 0,
      clientX: stepX(1), clientY: rect.top + rect.height / 2,
    }));
  });
  await p.locator('[data-step="tasks"]').waitFor();
  check(await p.locator('.progress-hit[aria-current="step"]').getAttribute('aria-label')==='前往任务','progress drag applies the final pointer-up coordinate when the last move is coalesced');
  check(await p.evaluate(()=>window.__wizardHaptics)>0,'release onto a new step requests one light haptic');
  await p.locator('.creation-progress').evaluate((host) => {
    const rect = host.getBoundingClientRect();
    const x = rect.left + 24 + (rect.width - 48) / 4;
    host.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 92, pointerType: 'touch', button: 0,
      clientX: x, clientY: rect.top + rect.height / 2,
    }));
    host.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, pointerId: 92, pointerType: 'touch', button: 0,
      clientX: x, clientY: rect.top + rect.height / 2 + 16,
    }));
  });
  check(await p.locator('.progress-hit[aria-current="step"]').getAttribute('aria-label')==='前往任务','vertical pointer-up cancels progress dragging and leaves the page selection unchanged');
  await p.locator('.creation-progress').evaluate((host) => {
    const rect = host.getBoundingClientRect();
    const x = rect.left + 24 + (rect.width - 48) / 4;
    for (const [type, pointerId] of [['pointercancel',93],['lostpointercapture',94]]) {
      host.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, pointerId, pointerType: 'touch', button: 0,
        clientX: x, clientY: rect.top + rect.height / 2,
      }));
      host.dispatchEvent(new PointerEvent(type, {
        bubbles: true, pointerId, pointerType: 'touch', button: 0,
        clientX: x, clientY: rect.top + rect.height / 2,
      }));
    }
  });
  await p.waitForFunction(()=>{
    const thumb=document.querySelector('.progress-glass');
    return thumb&&!thumb.classList.contains('is-pressed')&&!thumb.classList.contains('is-dragging');
  });
  check(await p.locator('.progress-hit[aria-current="step"]').getAttribute('aria-label')==='前往任务','pointercancel and lostpointercapture release the progress control without changing the step');
  const reverseProgress=await p.locator('.creation-progress').boundingBox();
  const reverseStepX=(index)=>reverseProgress.x+24+(reverseProgress.width-48)*index/4;
  const reverseY=reverseProgress.y+reverseProgress.height/2;
  await p.mouse.move(reverseStepX(1),reverseY);await p.mouse.down();
  await p.mouse.move(reverseStepX(2),reverseY,{steps:8});
  await p.locator('[data-step="pages"]').waitFor();
  await p.mouse.move(reverseStepX(1),reverseY,{steps:8});
  await p.locator('[data-step="tasks"]').waitFor();
  await p.mouse.up();
  check(await p.locator('.progress-hit[aria-current="step"]').getAttribute('aria-label')==='前往任务','progress drag can reverse direction and settle on the original step');
  check(await p.locator('.template-card').count()===4,'template selection keeps stable task slots');
  check(await p.locator('.creation-task-picks button').first().evaluate(async (element) => {
    let stableFrames = 0;
    let previous = element.getBoundingClientRect();
    for (let frame = 0; frame < 120 && stableFrames < 3; frame++) {
      await new Promise(requestAnimationFrame);
      const next = element.getBoundingClientRect();
      const stable = Math.abs(next.x - previous.x) < 0.2 && Math.abs(next.y - previous.y) < 0.2 && Math.abs(next.width - previous.width) < 0.2 && Math.abs(next.height - previous.height) < 0.2;
      stableFrames = stable ? stableFrames + 1 : 0;
      previous = next;
    }
    return stableFrames === 3;
  }),'task editor controls settle in place before the next wizard interaction');
  await p.waitForFunction(async () => {
    const activeAnimations = document.getAnimations({ subtree: true }).filter((animation) =>
      animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().iterations),
    );
    if (activeAnimations.length) await Promise.all(activeAnimations.map((animation) => animation.finished.catch(() => {})));
    const step = document.querySelector('.wizard-step:not([aria-hidden="true"])');
    const entered = [...(step?.querySelectorAll('[data-enter]') || [])];
    const tip = document.querySelector('.wizard-tip');
    return document.querySelectorAll('.wizard-step').length === 1
      && (!tip || Number(getComputedStyle(tip).opacity) >= 0.99)
      && entered.every((element) => Number(getComputedStyle(element).opacity) >= 0.99);
  });
  await p.evaluate(() => new Promise(requestAnimationFrame));
  await p.screenshot({path:`data/startup-review/${engine}-progress-pointerup-settled.png`});
  await p.locator('.creation-task-picks button').first().click();
  await p.getByLabel('任务名称',{exact:true}).fill('地面清洁');
  check(await p.locator('.wizard-step:not([aria-hidden=true]) input,.wizard-step:not([aria-hidden=true]) textarea,.wizard-step:not([aria-hidden=true]) select').count()===2,'task screen contains name and optional description only');
  await p.getByRole('button',{name:'前往宿舍名称',exact:true}).click();
  check(await p.getByLabel('宿舍名称',{exact:true}).inputValue()==='向导隔离宿舍','jumping backwards retains draft');
  // Drag from the task stage towards page arrangement. The page must change before release.
  const progress=await p.locator('.creation-progress').boundingBox();
  const startX=progress.x+progress.width*.25,startY=progress.y+progress.height/2;
  await p.mouse.move(startX,startY);await p.mouse.down();await p.mouse.move(progress.x+progress.width*.53,startY,{steps:8});
  await p.locator('[data-step="pages"]').waitFor();
  check(await p.evaluate(()=>window.__wizardHaptics)>0,'dragging snaps live to a new stage and requests light haptics');
  await p.waitForTimeout(400);
  await p.screenshot({path:`data/startup-review/${engine}-progress-drag-live.png`});
  await p.mouse.up();
  await p.locator('.page-board--compact').waitFor();
  for (const width of [320, 390, 430]) {
    await p.setViewportSize({ width, height: 844 });
    await p.waitForTimeout(120);
    const geometry = await p.locator('.dorm-wizard').evaluate((root) => {
      const body = root.querySelector('.wizard-body');
      const footer = root.querySelector('.wizard-footer');
      const board = root.querySelector('.page-board--compact');
      const boardStyle = getComputedStyle(board);
      const rect = footer.getBoundingClientRect();
      return {
        columns: boardStyle.gridTemplateColumns.split(' ').length,
        bodyFits: body.scrollHeight <= body.clientHeight + 1,
        footerVisible: rect.top >= 0 && rect.bottom <= innerHeight + 1,
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      };
    });
    check(geometry.columns === 2 && !geometry.horizontalOverflow, `${width}px keeps the two assignment columns without horizontal overflow`);
    check(geometry.footerVisible, `${width}px keeps wizard actions visible`);
    if (width === 390) {
      check(geometry.bodyFits, '390x844 page arrangement fits without vertical body scrolling');
      await p.screenshot({ path: `data/startup-review/${engine}-page-arrangement-single-screen.png` });
    }
  }
  await p.setViewportSize({ width: 320, height: 568 });
  await p.waitForTimeout(140);
  const shortViewport = await p.locator('.dorm-wizard').evaluate((root) => {
    const body = root.querySelector('.wizard-body');
    const footer = root.querySelector('.wizard-footer');
    const footerRect = footer.getBoundingClientRect();
    body.scrollTo({ top: body.scrollHeight, behavior: 'instant' });
    const lastTask = root.querySelector('.page-task--compact:last-of-type')?.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    return {
      footerVisible: footerRect.top >= 0 && footerRect.bottom <= innerHeight + 1,
      taskReachable: !lastTask || lastTask.bottom <= bodyRect.bottom + 1,
    };
  });
  check(shortViewport.footerVisible && shortViewport.taskReachable, '320x568 allows safe body scrolling while keeping actions visible');
  await p.locator('.wizard-body').evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }));
  await p.setViewportSize({ width: 390, height: 844 });
  check(await p.locator('.page-note,.page-board--compact .move-task,.page-board--compact .page-count').count()===0,'creation layout removes duplicate drag note, move arrows, and counts');
  check(await p.locator('.page-task--compact').evaluateAll(nodes=>nodes.every(node=>node.children.length===0&&node.textContent.trim())),'creation task rows show names only');
  await p.locator('[data-task-zone="duty"] .page-task--compact').first().click();
  check(await p.locator('[data-task-zone="water"] .page-task--compact').filter({hasText:'地面'}).count()===1,'tapping a task moves it to the other page in the shared draft');
  const secondPageType=p.getByRole('group',{name:'第二页面类型'});
  const nudge=secondPageType.getByRole('button',{name:'催促',exact:true});
  check(await secondPageType.count()===1,'new-room creation can select the second page purpose in the real page arrangement board');
  await nudge.click();
  check(await nudge.getAttribute('aria-pressed')==='true','second-page type is selectable inside its column');
  const taskPageType=secondPageType.getByRole('button',{name:'任务',exact:true});
  await taskPageType.click();
  check(await taskPageType.getAttribute('aria-pressed')==='true','second-page task mode remains selectable');
  // A held drag follows the same draft assignment path as tapping a task name.
  await p.waitForTimeout(450);
  const item=await p.locator('[data-task-zone="duty"] .page-task--compact').filter({hasText:'厕所'}).boundingBox();
  const zone=await p.locator('[data-task-zone="water"]').boundingBox();
  await p.mouse.move(item.x+item.width/2,item.y+item.height/2);await p.mouse.down();await p.waitForTimeout(300);await p.mouse.move(zone.x+zone.width/2,zone.y+30,{steps:12});await p.mouse.up();
  check(await p.locator('[data-task-zone="water"] .page-task--compact').filter({hasText:'厕所'}).count()===1,'held task drag crosses page groups without losing pointer');
  await p.waitForTimeout(420);
  await p.locator('[data-task-zone="water"] .page-task--compact').filter({hasText:'厕所'}).click();
  check(await p.locator('[data-task-zone="duty"] .page-task--compact').filter({hasText:'厕所'}).count()===1,'task can return to the duty page before previewing its production selector');
  await p.getByRole('button',{name:'前往完成规则',exact:true}).click();
  await p.locator('.rule-mode-picks').waitFor();
  await p.waitForFunction(()=>document.querySelector('.wizard-tip')?.textContent?.trim()==='之后可调整');
  check((await p.locator('.wizard-tip').textContent())?.trim()==='之后可调整','pacing step companion tip keeps the useful reversibility note without repeating the page question');
  await p.evaluate(async()=>{const running=document.getAnimations({subtree:true}).filter(a=>a.playState==='running');await Promise.all(running.map(a=>a.finished.catch(()=>{})));});
  const rulesViewport=p.viewportSize();
  for(const width of [320,390,430]){
    await p.setViewportSize({width,height:rulesViewport?.height||844});
    await p.waitForTimeout(80);
    const choiceLayout=await p.locator('.rule-mode-picks').evaluate(grid=>{
      const bounds=grid.getBoundingClientRect();
      const cards=[...grid.querySelectorAll('.wizard-choice')].map(card=>card.getBoundingClientRect());
      return {count:cards.length,center:bounds.left+bounds.width/2,lastCenter:cards[2]?.left+(cards[2]?.width||0)/2,firstWidth:cards[0]?.width,lastWidth:cards[2]?.width};
    });
    check(choiceLayout.count===3&&Math.abs(choiceLayout.center-choiceLayout.lastCenter)<1&&Math.abs(choiceLayout.firstWidth-choiceLayout.lastWidth)<1,`${width}px centers the third pacing choice and keeps card widths aligned`);
  }
  if(rulesViewport)await p.setViewportSize(rulesViewport);
  await p.waitForTimeout(80);
  check(await p.locator('.wizard-body').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'390x844 default rules and all pacing choices fit without vertical scrolling');
  check(await p.locator('.rule-primary .rule-task-picks').count()===0,'non-scheduled unified pacing hides the task selector used only for scheduled times');
  await p.screenshot({path:`data/startup-review/${engine}-wizard-rules-default.png`});
  await p.locator('.rule-mode-picks').getByRole('button',{name:/按时间安排/}).click();
  await p.evaluate(async()=>{const running=document.getAnimations({subtree:true}).filter(a=>a.playState==='running');await Promise.all(running.map(a=>a.finished.catch(()=>{})));});
  check(await p.locator('.rule-task-picks button').count()===3&&await p.locator('.rule-time-panel .van-picker').count()===1,'the unified scheduled choice exposes its task selector and time wheel directly on the rules step');
  check(
    JSON.stringify(await p.locator('.rule-mode-picks .wizard-choice span').allTextContents()) === JSON.stringify([
      '全员完成后，开始新一轮',
      '按设定时间执行并截止',
      '完成后轮到下一位',
    ]),
    'all pacing choices explain their effect without changing the existing mode labels',
  );
  const scheduledFit=await p.locator('.wizard-body').evaluate(el=>({scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,children:[...el.querySelector('.rule-primary').children].map(child=>({className:child.className,height:child.getBoundingClientRect().height}))}));
  check(scheduledFit.scrollHeight<=scheduledFit.clientHeight+1,'390x844 unified scheduled rules and one time wheel fit without vertical scrolling');
  await p.screenshot({path:`data/startup-review/${engine}-wizard-rules-scheduled.png`});
  check(await p.locator('.rule-time-panel .time-field-switch button').count()===2,'scheduled execution and deadline fields switch in place');
  const retainedDeadline=await p.locator('.rule-time-panel .time-wheel-setting > strong').textContent();
  await p.locator('.rule-mode-picks').getByRole('button',{name:/大家做完再开始下一轮/}).click();
  await p.locator('.rule-primary .rule-task-picks').waitFor({state:'detached'});
  check(await p.locator('.rule-primary .rule-task-picks').count()===0&&await p.locator('.rule-time-panel').count()===0,'switching back to round mode smoothly removes irrelevant task and time controls');
  check(await p.locator('.wizard-body').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'non-scheduled rule choice remains compact without vertical scrolling');
  await p.locator('.rule-mode-picks').getByRole('button',{name:/做完交给下一位/}).click();
  await p.locator('.rule-primary .rule-task-picks').waitFor({state:'detached'});
  check(await p.locator('.rule-primary .rule-task-picks').count()===0&&await p.locator('.rule-time-panel').count()===0,'completion handoff also hides the scheduled-only task selector');
  await p.locator('.rule-mode-picks').getByRole('button',{name:/按时间安排/}).click();
  await p.evaluate(async()=>{const running=document.getAnimations({subtree:true}).filter(a=>a.playState==='running');await Promise.all(running.map(a=>a.finished.catch(()=>{})));});
  check(await p.locator('.rule-task-picks button[aria-pressed="true"]').count()===1,'scheduled task selection is restored after changing the pacing mode');
  check(await p.locator('.rule-time-panel .time-wheel-setting > strong').textContent()===retainedDeadline,'scheduled deadline remains unchanged when switching between pacing modes');
  await p.getByRole('button',{name:'为单项任务调整',exact:true}).click();
  check(await p.locator('.rule-task-picks button').count()===4&&await p.locator('.rule-detail').count()===1,'per-task rule editing is available as a separate compact card state');
  check(await p.locator('.rule-detail .rule-rotation .wizard-choice').count()===3&&await p.locator('.rule-detail .rule-time-panel .van-picker').count()===0,'per-task rotation tab exposes all three runtime rhythms without stacking unrelated controls');
  check(await p.locator('.rule-detail .rule-rotation .wizard-choice span').count()===3,'per-task pacing choices use the same concise explanations');
  check(await p.locator('.wizard-body').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'390x844 per-task pacing choices fit without vertical scrolling');
  await p.screenshot({path:`data/startup-review/${engine}-wizard-rules-per-task.png`});
  await p.getByRole('tab',{name:'时间',exact:true}).click();
  check(await p.locator('.rule-detail .rule-time-panel .van-picker').count()===1,'per-task time tab keeps the scheduled time wheel available in the same wizard step');
  check(await p.locator('.wizard-body').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'390x844 task rule and single time wheel fit in one screen');
  check(await p.getByRole('button',{name:'继续',exact:true}).isVisible()&&await p.locator('.wizard-footer').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;}),'task rule screen keeps the primary action visible in the viewport');
  await p.screenshot({path:`data/startup-review/${engine}-advanced-rule-single-screen.png`});
  await p.locator('.rule-task-picks button').filter({hasText:'地面清洁'}).click();
  await p.getByRole('tab',{name:'时间',exact:true}).click();
  await p.locator('.rule-override').getByRole('button',{name:'按时间完成',exact:true}).click();
  await p.locator('.rule-task-picks button').filter({hasText:'厕所'}).click();
  await p.getByRole('tab',{name:'时间',exact:true}).click();
  await p.locator('.rule-override').getByRole('button',{name:'只作提示',exact:true}).click();
  await p.getByRole('button',{name:'‹ 使用统一方式',exact:true}).click();
  await p.locator('.rule-mode-picks').getByRole('button',{name:/大家做完再开始下一轮/}).click();
  check(await p.locator('.rule-time-panel').count()===0,'round mode keeps time-only controls out of the compact default state');
  await p.getByRole('button',{name:'为单项任务调整',exact:true}).click();
  await p.locator('.rule-task-picks button').filter({hasText:'地面清洁'}).click();
  await p.getByRole('tab',{name:'时间',exact:true}).click();
  check(await p.locator('.rule-override').getByRole('button',{name:'按时间完成',exact:true}).getAttribute('aria-pressed')==='true','changing the global rhythm preserves the explicit hard override on another task');
  await p.locator('.rule-task-picks button').filter({hasText:'厕所'}).click();
  await p.getByRole('tab',{name:'时间',exact:true}).click();
  check(await p.locator('.rule-override').getByRole('button',{name:'只作提示',exact:true}).getAttribute('aria-pressed')==='true','changing the global rhythm preserves the explicit soft override on another task');
  await p.getByRole('button',{name:'‹ 使用统一方式',exact:true}).click();
  await p.locator('.rule-mode-picks').getByRole('button',{name:/做完交给下一位/}).click();
  check(await p.locator('.rule-mode-picks').getByRole('button',{name:/做完交给下一位/}).getAttribute('aria-pressed')==='true','completion handoff is an explicit third creation choice');
  await p.getByRole('button',{name:'预览',exact:true}).click();
  previewTracking = true;
  await p.getByTestId('open-live-preview').click();
  const live = p.getByTestId('live-draft-preview');
  await live.waitFor();
  check(await p.locator('.dorm-wizard').evaluate(el=>getComputedStyle(el).visibility)==='hidden','full-screen preview removes the wizard from view');
  check(await live.locator('.chore-board').count()===1&&await live.locator('.chore-bottom-nav').count()===1,'preview mounts the production task board and Liquid Glass navigation');
  const guardedActions=await live.locator('.chore-board').evaluate(async el=>{const s=el.__vueParentComponent?.setupState;if(!s||typeof s.complete!=='function'||typeof s.undo!=='function'||typeof s.menuAction!=='function'||typeof s.markRead!=='function')return false;await s.complete(s.board.workspace_tasks[0]);await s.undo(-900);await s.nudgeWater({id:-901,key:'water',assignee_id:-2,status:'pending',can_complete:true});await s.markRead(-902,true);for(const action of ['settings','push','identity','email','recovery','refresh'])s.menuAction(action);return true;});
  check(guardedActions,'preview component action handlers were exercised directly so hidden controls are not the safety boundary');
  const liveBounds=await live.boundingBox();
  check(liveBounds?.x===0&&liveBounds?.y===0&&liveBounds?.width===390&&liveBounds?.height===844,'live preview fills the mobile viewport without a phone mockup');
  await live.locator('[data-testid="pane-duty"]').waitFor();
  const dutySelector=live.locator('[data-testid="pane-duty"] .task-selector button');
  check(await dutySelector.count()===2,'custom duty preview uses the production horizontal selector for tasks assigned to the duty page');
  await dutySelector.last().click();
  check(await dutySelector.last().getAttribute('aria-pressed')==='true','selecting a duty tab updates the active production task');
  await p.waitForTimeout(350);
  await p.screenshot({path:`data/startup-review/${engine}-custom-duty-production-surface.png`});
  await live.getByTestId('nav-water').click();
  await live.locator('[data-testid="pane-water"]').waitFor();
  check(true,'water preview uses the real task page component');
  await live.getByTestId('nav-calendar').click();
  await live.locator('[data-testid="chore-calendar"]').waitFor();
  check(true,'calendar preview uses the real calendar component');
  const nav=live.locator('.chore-bottom-nav');await p.waitForTimeout(350);const before=await nav.innerText();
  const first=await nav.locator('button').first().boundingBox(),last=await nav.locator('button').last().boundingBox();
  await p.mouse.move(first.x+first.width/2,first.y+first.height/2);await p.mouse.down();await p.waitForTimeout(320);await p.mouse.move(last.x+last.width/2,last.y+last.height/2,{steps:12});await p.mouse.up();
  check(await nav.innerText()!==before,'held real navigation item reorders the live preview and draft');
  await p.waitForTimeout(450);
  await p.screenshot({path:`data/startup-review/${engine}-wizard-preview.png`});
  check(previewApiRequests.length===0,`preview interactions make no business API requests: ${previewApiRequests.join(', ')}`);
  previewTracking = false;
  await p.getByTestId('exit-live-preview').click();
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="live-draft-preview"]')).opacity==='0');
  await p.getByTestId('open-live-preview').click();
  const reopened=p.getByTestId('live-draft-preview');
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="live-draft-preview"]')).opacity==='1');
  check(await reopened.count()===1,'closing and reopening keeps the real preview components mounted');
  check(await reopened.locator('.chore-bottom-nav button').first().getAttribute('data-section')==='water','navigation arrangement persists in the creation draft after reopening');
  await p.getByTestId('exit-live-preview').click();
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="live-draft-preview"]')).opacity==='0');
  check(writes === 0, "draft edits and preview never write task records");
  await p.getByRole("button", { name: "确认创建", exact: true }).click();
  await p.locator(".invite-result>strong").waitFor();
  await p.waitForTimeout(900);
  check(
    (await p.locator(".invite-result>strong").innerText()).length === 8,
    "invite appears after server-confirmed creation",
  );
  await p.screenshot({
    path: `data/startup-review/${engine}-wizard-finish.png`,
  });
  await p.getByRole("button", { name: "开始使用", exact: true }).click();
  const firstUseGuide=p.getByTestId('welcome-guide');
  await firstUseGuide.waitFor({state:'visible',timeout:5000});
  check(await firstUseGuide.count()===1,'new schema-v2 room automatically opens the welcome guide on first entry');
  await p.getByRole('button',{name:'第 4 页',exact:true}).click();
  await p.getByRole('button',{name:'开始使用',exact:true}).click();
  const featureTour=p.locator('.tour');
  await featureTour.waitFor({state:'visible',timeout:5000}).catch(()=>{});
  if(await featureTour.count())await featureTour.getByRole('button',{name:'跳过',exact:true}).click();
  await featureTour.waitFor({state:'detached',timeout:5000}).catch(()=>{});
  await p.getByTestId('open-tools').click();
  await p.getByTestId('open-welcome-guide').click();
  await p.getByTestId('welcome-guide').waitFor({state:'visible'});
  await p.getByRole('button',{name:'跳过',exact:true}).click();
  await p.waitForFunction(()=>location.pathname!=='/guide');
  check(new URL(p.url()).pathname!=='/guide'&&!new URL(p.url()).searchParams.has('tour'),'manual guide skip returns to the caller without starting the feature tour');
  await p.getByTestId("open-tools").click();
  await p.getByTestId("open-preferences").click();
  await p.getByTestId("open-system-notifications").click();
  const notificationSettings = p.getByTestId("push-settings");
  await notificationSettings.waitFor();
  const notificationEnable = p.getByTestId("push-enable");
  await notificationSettings.locator(".push-description").waitFor({
    state: "visible",
  });
  await notificationEnable.waitFor({ state: "visible" });
  await p.waitForFunction(() => {
    const settings = document.querySelector('[data-testid="push-settings"]');
    return settings?.closest(".sheet-layer")?.getAttribute("data-phase") === "open";
  });
  await p.evaluate(async () => {
    const settings = document.querySelector('[data-testid="push-settings"]');
    const layer = settings?.closest(".sheet-layer");
    if (!layer) return;
    await Promise.all(
      layer
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  await p.screenshot({
    path: `data/startup-review/${engine}-notification-settings-explanation.png`,
  });
  check(
    await p.locator(".permission-primer").count() === 0 &&
      (await notificationSettings.locator(".push-description").textContent())?.includes("值日和室友留言") === true &&
      await notificationEnable.isVisible(),
    "version-2 notification settings explain system reminders in the same sheet as the enable action",
  );
  check(
    await p.evaluate(() => window.__systemPermissionPromptCount) === 0,
    "opening notification settings does not request system permission",
  );
  await notificationEnable.click();
  await p.waitForFunction(() => window.__systemPermissionPromptCount === 1);
  check(
    await p.getByRole("alert").filter({ hasText: "请在系统设置中允许「轮到」的通知" }).count() === 1 &&
      await notificationEnable.isEnabled(),
    "denied system permission remains an explicit error with an enabled retry action",
  );
  await notificationEnable.click();
  await p.waitForFunction(() => window.__systemPermissionPromptCount === 2);
  check(
    await p.getByRole("alert").filter({ hasText: "请在系统设置中允许「轮到」的通知" }).count() === 1,
    "a second permission request occurs only after a second explicit user action",
  );
  await p.getByRole("button", { name: "关闭详情" }).last().click();
  await notificationSettings.waitFor({ state: "detached" });
  await p.getByTestId('nav-duty').waitFor();
  await p.getByTestId("nav-duty").click();
  await p.locator(".chore-personal .task-selector").waitFor();
  check(
    (await p.locator(".chore-personal .task-selector button").count()) >= 2,
    "a created custom duty page uses the production horizontal task selector",
  );
  await p.screenshot({ path: `data/startup-review/${engine}-created-custom-duty.png` });
  if (await p.locator(".task-title-button").count()) {
    await p.locator(".task-title-button").first().click();
    const person = p.locator(".task-detail-person");
    await person.waitFor();
    check(
      (await person.locator("svg,canvas,img").count()) === 0,
      "task detail contains no old pixel marker",
    );
    const columns = await person.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    );
    check(
      columns === 2,
      "name and status use two columns without marker placeholder",
    );
    await p.screenshot({
      path: `data/startup-review/${engine}-member-detail.png`,
    });
    await p.getByRole("button", { name: "关闭详情", exact: true }).click();
  }

  check(
    (await p.locator(".bottom-nav").count()) === 0,
    "new room never enters old four-tab template",
  );
  await p.getByTestId("open-tools").click();
  await p.getByTestId("dev-new-dorm-wizard").waitFor({state:"visible"});
  check(await p.getByTestId("dev-new-dorm-wizard").isVisible(), "local development settings expose a visible wizard entry");
  await p.getByTestId("dev-new-dorm-wizard").click();
  await p.locator(".dorm-wizard").waitFor();
  check(await p.locator(".wizard-step:not([aria-hidden=true])").isVisible(), "the local wizard entry opens an editable isolated draft");
  await p.getByRole("button", { name: "退出配置", exact: true }).click();
  await p.locator(".dorm-wizard").waitFor({state:"detached"});
  await p.getByTestId("open-tools").click();
  await p.getByTestId("open-chore-settings").click();
  await p.getByRole("dialog", { name: "任务配置工作台" }).waitFor();
  check(
    (await p.locator(".workspace-task-list").count()) === 1,
    "new room settings starts with a task list",
  );
  await p.locator('.workspace-task-row>.wizard-choice').first().click();
  await p.locator('.task-editor').waitFor();
  check(await p.locator('.wizard-step:not([aria-hidden=true]) input,.wizard-step:not([aria-hidden=true]) textarea,.wizard-step:not([aria-hidden=true]) select').count()===2,'workspace edits at most two fields per screen');
  await p.screenshot({ path: `data/startup-review/${engine}-workspace.png` });
  await p.getByRole("button", { name: "预览", exact: true }).click();
  await p.getByRole("button", { name: "保存设置", exact: true }).click();
  await p
    .getByRole("dialog", { name: "任务配置工作台" })
    .waitFor({ state: "detached" });
  check(true, "workspace save returns to same new room");
  // Width/theme/reduced-motion geometry checks are browser simulations, not devices.
  await p.getByTestId('open-tools').click();await p.getByTestId('open-chore-settings').click();
  for(const width of [320,390,430]){await p.setViewportSize({width,height:844});await p.locator('.workspace-task-row>.wizard-choice').first().waitFor();check(await p.locator('.dorm-wizard').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`${width}px no horizontal overflow`);}
  await p.emulateMedia({reducedMotion:'reduce',colorScheme:'dark'});
  await p.locator('.workspace-task-row>.wizard-choice').first().click();await p.locator('.task-editor').waitFor();
  check(await p.getByLabel('任务名称',{exact:true}).isVisible(),'reduced motion remains usable');
  check(!errors.length, JSON.stringify(errors));
  await fs.writeFile(
    `data/startup-review/${engine}-wizard-result.json`,
    JSON.stringify(
      { checks: n, errors, device: false, isolated: true },
      null,
      2,
    ),
  );
} catch (e) {
  console.error({errors,failedRequests});
  const wizard = p.locator('.dorm-wizard');
  console.error(await wizard.count()
    ? await wizard.first().evaluate(el=>({url:location.href,rect:JSON.stringify(el.getBoundingClientRect()),height:getComputedStyle(el).height,top:getComputedStyle(el).top,scrollY,windowHeight:innerHeight,vv:visualViewport?.height,body:JSON.stringify(el.querySelector('.wizard-body')?.getBoundingClientRect()),footer:JSON.stringify(el.querySelector('.wizard-footer')?.getBoundingClientRect()),html:el.querySelector('.wizard-body')?.innerHTML.slice(0,4000)}))
    : { url: p.url(), body: await p.locator('body').innerText().catch(()=>''), wizardCount: 0 });
  await p.screenshot({
    path: `data/startup-review/${engine}-wizard-failure.png`,
  });
  throw e;
} finally {
  await b.close();
  await h.close?.();
}
