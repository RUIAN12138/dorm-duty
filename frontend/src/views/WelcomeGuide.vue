<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import DormCompanion from "../components/DormCompanion.vue";
import { motionAllowed } from "../interaction/motion";

const router = useRouter();
const GUIDE_FLOW_KEY = "dorm-guide-flow-v2";
const GUIDE_OPEN_KEY = "dorm-guide-open-v2";
const pages = [
  { title: "先看今天轮到谁", text: "首页会把今天的任务和负责人放在最前面。", mood: "02" },
  { title: "做完后记录一下", text: "完成任务后可以查看本轮进度和下一位室友。", mood: "05" },
  { title: "需要时提醒室友", text: "可以给室友留言，也能查看收到的消息。", mood: "03" },
  { title: "日历里看完成记录", text: "按月查看记录，也可以在设置里调整任务。", mood: "19" },
];
const track = ref<HTMLElement>();
const index = ref(0);
let programmaticTarget: number | null = null;
const progress = computed(() => index.value / Math.max(1, pages.length - 1));
function updateIndex() {
  const el = track.value;
  if (!el) return;
  const measured = Math.max(0, Math.min(pages.length - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
  if (programmaticTarget !== null) {
    const targetOffset = programmaticTarget * el.clientWidth;
    index.value = measured;
    if (Math.abs(el.scrollLeft - targetOffset) < 2) {
      index.value = programmaticTarget;
      programmaticTarget = null;
    }
    return;
  }
  index.value = measured;
}
function goTo(value: number) {
  const target = Math.max(0, Math.min(pages.length - 1, value));
  const el = track.value;
  if (!el) return;
  const targetOffset = target * el.clientWidth;
  if (Math.abs(el.scrollLeft - targetOffset) < 2) {
    programmaticTarget = null;
    index.value = target;
    return;
  }
  programmaticTarget = target;
  el.scrollTo({ left: targetOffset, behavior: motionAllowed() ? "smooth" : "instant" });
  if (!motionAllowed()) {
    index.value = target;
    programmaticTarget = null;
  }
}
function returnTarget(value: unknown) {
  if (typeof value !== "string") return "/";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !["/", "/water", "/calendar"].includes(url.pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/"; }
}
async function finish(skipped = false) {
  let flow: { version?: number; returnTo?: string; seenKey?: string | null; firstUse?: boolean; showFeatureTour?: boolean } | null = null;
  try {
    flow = JSON.parse(sessionStorage.getItem(GUIDE_FLOW_KEY) || "null");
    if (flow?.version === 2 && flow.firstUse && typeof flow.seenKey === "string")
      localStorage.setItem(flow.seenKey, "done");
    localStorage.setItem("dorm-welcome-guide-v1", "done");
    sessionStorage.removeItem(GUIDE_FLOW_KEY);
    if (flow?.firstUse) sessionStorage.removeItem(GUIDE_OPEN_KEY);
  } catch { /* Tutorial and return remain available when storage is blocked. */ }
  let target = returnTarget(flow?.returnTo);
  if (!skipped && flow?.version === 2 && flow.showFeatureTour) {
    const url = new URL(target, window.location.origin);
    url.searchParams.set("tour", "1");
    target = `${url.pathname}${url.search}${url.hash}`;
  }
  await router.replace(target);
}
onMounted(async () => { await nextTick(); updateIndex(); });
</script>

<template>
  <main class="welcome-guide" data-testid="welcome-guide">
    <header><button class="guide-skip" @click="finish(true)">跳过</button><span>轮到 · 使用引导</span></header>
    <div ref="track" class="guide-pages" @pointerdown="programmaticTarget=null" @scroll.passive="updateIndex">
      <section v-for="(page, i) in pages" :key="page.title" class="guide-page" :aria-hidden="i !== index">
        <DormCompanion :size="112" :mood="page.mood" :interactive="false" :tips="false" />
        <h1>{{ page.title }}</h1>
        <p>{{ page.text }}</p>
      </section>
    </div>
    <footer>
      <div class="guide-dots" aria-label="引导进度">
        <button v-for="(_, i) in pages" :key="i" :class="{ active: i === index }" :aria-label="`第 ${i + 1} 页`" :aria-current="i === index ? 'step' : undefined" @click="goTo(i)" />
      </div>
      <button class="guide-next" @click="index === pages.length - 1 ? finish() : goTo(index + 1)">{{ index === pages.length - 1 ? "开始使用" : "继续" }}</button>
    </footer>
  </main>
</template>

<style scoped>
.welcome-guide { position: fixed; inset: 0; z-index: 220; display: flex; flex-direction: column; padding: calc(env(safe-area-inset-top,0px) + 12px) 24px calc(env(safe-area-inset-bottom,0px) + 16px); color: var(--ink); background: var(--canvas); box-sizing: border-box; }
header { display: flex; align-items: center; justify-content: center; min-height: 44px; position: relative; color: var(--muted); font-size: 14px; }
.guide-skip { position: absolute; right: 0; min-width: 56px; min-height: 44px; border: 0; background: none; color: var(--muted); font: inherit; }
.guide-pages { display: flex; flex: 1; min-height: 0; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; scrollbar-width: none; margin-inline: -24px; }
.guide-pages::-webkit-scrollbar { display: none; }
.guide-page { flex: 0 0 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; box-sizing: border-box; scroll-snap-align: center; }
.guide-page :deep(.dorm-companion) { margin-bottom: 48px; }
h1 { max-width: 12em; font-size: clamp(34px, 9vw, 48px); line-height: 1.14; letter-spacing: -.04em; margin: 0; }
p { max-width: 22em; margin: 20px 0 0; color: var(--muted); font-size: 17px; line-height: 1.6; }
footer { display: grid; justify-items: center; gap: 28px; padding-top: 18px; }
.guide-dots { display: flex; align-items: center; gap: 0; min-height: 44px; }
.guide-dots button { position: relative; flex: 0 0 24px; width: 24px; height: 44px; border: 0; border-radius: 999px; padding: 0; background: transparent; transition: transform 120ms cubic-bezier(.22,1,.36,1); }
.guide-dots button:active { transform: scale(.94); }
.guide-dots button::before { content: ""; position: absolute; left: 50%; top: 50%; width: 8px; height: 8px; border-radius: 999px; background: color-mix(in srgb,var(--ink) 22%,transparent); transform: translate(-50%,-50%); transition: transform 260ms cubic-bezier(.22,1,.36,1),background 180ms; }
.guide-dots button.active::before { background: var(--ink); transform: translate(-50%,-50%) scaleX(2.75); }
.guide-next { width: 100%; max-width: 460px; min-height: 56px; border: 0; border-radius: 30px; color: var(--canvas); background: var(--ink); font: inherit; font-weight: 600; transition: transform 220ms cubic-bezier(.22,1,.36,1); }
.guide-next:active { transform: scale(.985); }
@media (prefers-reduced-motion: reduce) { .guide-dots button,.guide-dots button::before,.guide-next { transition: none; } .guide-dots button:active,.guide-next:active { transform: none; } }
</style>
