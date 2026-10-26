<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import DormCompanion from "../DormCompanion.vue";
export interface PracticeStep {
  id: string;
  target: string;
  title: string;
  text: string;
  result: string;
  resultTarget?: string;
  completed: () => boolean;
}
const props = defineProps<{ step: PracticeStep; count: number; index: number }>();
const emit = defineEmits<{ next: []; leave: [] }>();
const note = ref<HTMLElement>();
// Keep tutorial controls inside the active dialog focus/pointer boundary.
const portalHost = ref<HTMLElement | string>("body");
const paused = ref(false);
const box = ref({ x: 0, y: 0, width: 0, height: 0, radius: 20 });
const viewport = ref({ top: 0, height: innerHeight, width: innerWidth });
const ready = ref(false), complete = ref(false), noteY = ref(80);
const compact = computed(() => viewport.value.height < 480);
let frame = 0, disposed = false, advanceEpoch = 0;
let target: HTMLElement | null = null;
const resize = new ResizeObserver(schedule);
const mutations = new MutationObserver((changes) => {
  if (changes.some((c) => !(c.target instanceof Element) || !c.target.closest(".practice-coach,.dorm-companion"))) schedule();
});
function schedule() {
  if (!frame && !disposed) frame = requestAnimationFrame(measure);
}
function measure() {
  frame = 0;
  const vv = window.visualViewport;
  viewport.value = { top: vv?.offsetTop || 0, height: vv?.height || innerHeight, width: vv?.width || innerWidth };
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((el) =>
    !el.closest("[inert],[aria-hidden=true]") && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== "hidden");
  // Global release/security dialogs own input until dismissed. Never put the
  // coach inside them or cover their real actions with tutorial blockers.
  paused.value = dialogs.some(el => !el.matches(".sheet-layer,.companion-chat"));
  portalHost.value = paused.value ? "body" : dialogs.at(-1) || "body";
  complete.value = props.step.completed();
  const next = document.querySelector<HTMLElement>(complete.value && props.step.resultTarget ? props.step.resultTarget : props.step.target);
  if (next !== target) {
    if (target) resize.unobserve(target);
    target = next;
    if (target) resize.observe(target);
  }
  const rect = target?.getBoundingClientRect();
  ready.value = !!target && !!rect && rect.width > 0 && rect.height > 0 &&
    !target.closest("[inert],[aria-hidden=true]") && getComputedStyle(target).visibility !== "hidden";
  if (!rect || !ready.value) return;
  const style = getComputedStyle(target!);
  const x = Math.max(0, rect.left - 5), y = Math.max(viewport.value.top, rect.top - 5);
  box.value = {
    x, y, width: Math.min(viewport.value.width - x, rect.right + 5 - x),
    height: Math.min(viewport.value.top + viewport.value.height - y, rect.bottom + 5 - y),
    radius: Math.min(rect.height / 2 + 5, (parseFloat(style.borderRadius) || 18) + 5),
  };
  const h = note.value?.offsetHeight || 180;
  const safe = parseFloat(getComputedStyle(note.value!).getPropertyValue("--practice-safe-top")) || 0;
  const top = viewport.value.top + safe + 12, bottom = viewport.value.top + viewport.value.height - 12;
  // Narration belongs above the app; only move it when the real target needs
  // that space (e.g. the companion or back button). Never move the app itself.
  const avoid = target?.matches(".elastic-sheet")
    ? target.querySelector<HTMLElement>('button[aria-label="关闭详情"]')?.getBoundingClientRect() || rect : rect;
  noteY.value = avoid.top < top + h + 12 && avoid.bottom > top
    ? Math.max(top, Math.min(bottom - h, avoid.bottom + 12)) : top;
}
const blocks = computed(() => {
  const b = box.value, v = viewport.value;
  if (!ready.value) return [{ left: 0, top: v.top, width: v.width, height: v.height }];
  return [
    { left: 0, top: v.top, width: v.width, height: Math.max(0, b.y - v.top) },
    { left: 0, top: b.y, width: Math.max(0, b.x), height: b.height },
    { left: b.x + b.width, top: b.y, width: Math.max(0, v.width - b.x - b.width), height: b.height },
    { left: 0, top: b.y + b.height, width: v.width, height: Math.max(0, v.top + v.height - b.y - b.height) },
  ];
});
function blockKeys(event: KeyboardEvent) {
  if (paused.value) return;
  if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); emit("leave"); return; }
  if (event.key === "Tab") {
    const current = document.activeElement;
    // Keep native focus/selection inside an active dialog. Outside dialogs,
    // restrict Tab to the current real target and tutorial actions.
    if (current?.closest('[role="dialog"]')) return;
    const elements = [target, ...(target?.querySelectorAll<HTMLElement>("button,input,textarea,[tabindex='0']") || []),
      ...(note.value?.querySelectorAll<HTMLElement>("button:not(:disabled)") || [])]
      .filter((el): el is HTMLElement => !!el && el.tabIndex >= 0 && !el.matches(":disabled") && !!el.getClientRects().length);
    if (elements.length) {
      event.preventDefault();
      const at = elements.indexOf(current as HTMLElement), direction = event.shiftKey ? -1 : 1;
      elements[(at + direction + elements.length) % elements.length]!.focus({ preventScroll: true });
    }
  }
}
async function advanceAfterMotion() {
  const epoch = ++advanceEpoch, id = props.step.id;
  await nextTick();
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  if (disposed || paused.value || epoch !== advanceEpoch || id !== props.step.id) return;
  const roots = [target?.closest<HTMLElement>(".sheet-layer,.companion-chat,.focus-pane") || target];
  const animations = roots.flatMap(root => root?.getAnimations({subtree:true}) || [])
    .filter(animation => animation.playState !== "finished" &&
      animation.effect?.getTiming().iterations !== Infinity &&
      !((animation.effect as KeyframeEffect | null)?.target as Element | null)?.closest(".dorm-companion"));
  await Promise.allSettled(animations.map(animation => animation.finished));
  if (!disposed && epoch === advanceEpoch && id === props.step.id && !paused.value && props.step.completed()) emit("next");
}
watch([complete, paused], ([done, blocked]) => {
  if (done && !blocked) void advanceAfterMotion();
  else advanceEpoch++;
}, {flush:"post"});
watch(() => props.step.id, async () => {
  advanceEpoch++;
  complete.value = false; ready.value = false;
  await nextTick(); schedule();
});
onMounted(() => {
  mutations.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  if (note.value) resize.observe(note.value);
  window.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
  document.addEventListener("scroll", schedule, true);
  document.addEventListener("transitionend", schedule, true);
  document.addEventListener("keydown", blockKeys, true);
  schedule();
});
onBeforeUnmount(() => {
  disposed = true; advanceEpoch++; cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect();
  window.removeEventListener("resize", schedule);
  window.visualViewport?.removeEventListener("resize", schedule);
  window.visualViewport?.removeEventListener("scroll", schedule);
  document.removeEventListener("scroll", schedule, true);
  document.removeEventListener("transitionend", schedule, true);
  document.removeEventListener("keydown", blockKeys, true);
});
</script>
<template>
  <Teleport :to="portalHost">
    <div v-show="!paused" class="practice-coach" :class="{ compact }" data-testid="practice-coach" :data-step="step.id" :data-complete="complete">
      <div v-for="(block, i) in blocks" :key="i" class="practice-block" :style="Object.fromEntries(Object.entries(block).map(([k,v]) => [k, `${v}px`]))" />
      <div v-if="ready" class="practice-light" :style="{ left:`${box.x}px`,top:`${box.y}px`,width:`${box.width}px`,height:`${box.height}px`,borderRadius:`${box.radius}px` }" />
      <aside ref="note" class="practice-note" :style="{ top:`${noteY}px` }" aria-label="操作练习" aria-live="polite">
        <DormCompanion :size="48" :mood="complete ? '05' : '02'" :interactive="false" :tips="false" :lite-effects="true" />
        <div class="practice-speech">
          <span class="practice-speaker">球球</span>
          <Transition name="practice-copy" mode="out-in">
            <div :key="step.id">
              <h2>{{ step.title }}</h2>
              <p class="practice-description">{{ step.text }}</p>
            </div>
          </Transition>
        </div>
        <button type="button" class="practice-exit" aria-label="退出本节练习，返回目录" @click="emit('leave')">退出</button>
      </aside>
    </div>
  </Teleport>
</template>
<style scoped>
.practice-coach { position: fixed; inset: 0; z-index: 9000; pointer-events: none; }
.practice-block { position: fixed; pointer-events: auto; touch-action: none; }
.practice-light { position: fixed; box-shadow: 0 0 0 200vmax #0008; pointer-events: none; transition: left 260ms var(--ui-ease-out),top 260ms var(--ui-ease-out),width 260ms var(--ui-ease-out),height 260ms var(--ui-ease-out),border-radius 260ms var(--ui-ease-out); }
.practice-note { --practice-safe-top: env(safe-area-inset-top,0px); display: flex; align-items: flex-start; gap: 10px; position: fixed; left: max(16px, calc((100vw - 470px) / 2)); right: max(16px, calc((100vw - 470px) / 2)); padding: 0; border-radius: 24px; color: var(--ink,#111); pointer-events: none; transition: top 220ms var(--ui-ease-out); }
.practice-note :deep(.companion-frame) { flex: none; margin-top: 4px; }
.practice-speech { min-width: 0; flex: 1; padding: 12px 16px; border-radius: 8px 24px 24px; background: var(--canvas,#fff); box-shadow: 0 8px 28px #0001; }
.practice-speaker { display: block; color: var(--muted); font-size: 12px; margin-bottom: 4px; }
h2 { margin: 0; font-size: 18px; line-height: 1.35; letter-spacing: -.02em; text-wrap: pretty; }
.practice-description { margin: 6px 0 0; font-size: 14px; line-height: 1.5; color: var(--muted); text-wrap: pretty; }
.practice-exit { flex: none; border: 0; background: var(--canvas); min-height: 44px; min-width: 44px; padding: 8px; border-radius: 22px; color: var(--muted); font: inherit; font-size: 12px; pointer-events: auto; transition: transform 160ms var(--ui-ease-out),opacity 160ms; }
.practice-exit:active { transform: scale(.94); }
.compact .practice-speech { padding: 8px 12px; }
.compact h2 { font-size: 16px; }
.compact .practice-description { font-size: 13px; margin-top: 4px; }
.practice-copy-enter-active,.practice-copy-leave-active { transition: opacity 130ms ease-out,transform 160ms var(--ui-ease-out); }
.practice-copy-enter-from { opacity: 0; transform: translateY(5px); }
.practice-copy-leave-to { opacity: 0; transform: translateY(-3px); }
@media (prefers-reduced-motion:reduce) { .practice-light,.practice-note, .practice-exit,.practice-copy-enter-active,.practice-copy-leave-active { transition: none; } .practice-exit:active { transform: none; } }
</style>
