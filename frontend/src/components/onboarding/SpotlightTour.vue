<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
const props = defineProps<{
  steps: { target: string; text: string }[];
  returnFocusSelector?: string;
}>();
const emit = defineEmits<{ done: [] }>();
const noteTop = ref(100);
const activeElement = document.activeElement;
const trigger =
  (props.returnFocusSelector
    ? document.querySelector<HTMLElement>(props.returnFocusSelector)
    : null) ||
  (activeElement instanceof HTMLElement && activeElement !== document.body
    ? activeElement
    : null);
const host = ref<HTMLElement>();
const index = ref(0),
  box = ref({ x: 16, y: 80, width: 44, height: 44 });
let positionFrame = 0;
let positionRevision = 0;
const observedLayout = new Set<Element>();
const targetObserver = typeof ResizeObserver === "undefined"
  ? null
  : new ResizeObserver(schedulePosition);
async function position() {
  const revision = ++positionRevision;
  const step = props.steps[index.value];
  if (!step) { emit("done"); return; }
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if (revision !== positionRevision) return;
  const el = document.querySelector<HTMLElement>(step.target);
  const wizard = host.value?.closest<HTMLElement>(".dorm-wizard");
  for (const item of [el, wizard?.querySelector<HTMLElement>(".wizard-guide"), wizard?.querySelector<HTMLElement>(".wizard-body")]) {
    if (targetObserver && item && !observedLayout.has(item)) {
      targetObserver.observe(item);
      observedLayout.add(item);
    }
  }
  const r = el?.getBoundingClientRect();
  const hostRect = host.value?.getBoundingClientRect();
  const hostWidth = host.value?.offsetWidth || hostRect?.width || 1;
  const hostHeight = host.value?.offsetHeight || hostRect?.height || 1;
  const scaleX = (hostRect?.width || hostWidth) / hostWidth;
  const scaleY = (hostRect?.height || hostHeight) / hostHeight;
  const viewportTop = window.visualViewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);
  const style = el ? getComputedStyle(el) : null;
  const visible = !!el && !!r && !!style && el.isConnected &&
    style.display !== "none" && style.visibility !== "hidden" &&
    Number(style.opacity) > 0 && r.width > 0 && r.height > 0 &&
    r.bottom > viewportTop && r.right > 0 && r.top < viewportBottom && r.left < window.innerWidth;
  if (!visible || !r) {
    if (index.value + 1 < props.steps.length) index.value++;
    else emit("done");
    return;
  }
  const originX = hostRect?.left ?? 0;
  const originY = hostRect?.top ?? 0;
  noteTop.value = r.bottom + 180 > viewportBottom
    ? Math.max(16 / scaleY, (r.top - originY - 170) / scaleY)
    : (r.bottom - originY + 24) / scaleY;
  box.value = {
    x: (r.x - originX - 6) / scaleX,
    y: (r.y - originY - 6) / scaleY,
    width: (r.width + 12) / scaleX,
    height: (r.height + 12) / scaleY,
  };
}
function schedulePosition() {
  positionRevision++;
  if (positionFrame) cancelAnimationFrame(positionFrame);
  positionFrame = requestAnimationFrame(() => {
    positionFrame = 0;
    void position();
  });
}
function layoutTransitionEnd(event: TransitionEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.classList.contains("wizard-guide") && event.propertyName === "flex-basis")
    schedulePosition();
}
watch(index, position, { immediate: true });
window.addEventListener("resize", schedulePosition);
window.visualViewport?.addEventListener("resize", schedulePosition);
window.visualViewport?.addEventListener("scroll", schedulePosition);
document.addEventListener("transitionend", layoutTransitionEnd, true);
onBeforeUnmount(() => {
  if (positionFrame) cancelAnimationFrame(positionFrame);
  targetObserver?.disconnect();
  observedLayout.clear();
  window.removeEventListener("resize", schedulePosition);
  window.visualViewport?.removeEventListener("resize", schedulePosition);
  window.visualViewport?.removeEventListener("scroll", schedulePosition);
  document.removeEventListener("transitionend", layoutTransitionEnd, true);
  if (trigger?.isConnected) trigger.focus({ preventScroll: true });
});
</script>
<template>
  <div
    ref="host"
    class="tour"
    role="dialog"
    aria-modal="true"
    aria-label="功能引导"
    @keydown.esc="$emit('done')"
  >
      <div
        class="tour-light"
        :style="{
          left: `${box.x}px`,
          top: `${box.y}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
          borderRadius: `${Math.min(box.height/2,24)}px`,
        }"
      />
      <div
        class="tour-note"
        :style="{
          top: `${noteTop}px`,
        }"
      >
        <p>{{ steps[index]?.text }}</p>
        <div>
          <button @click="$emit('done')">跳过</button><button v-if="index>0" @click="index--">上一步</button
          ><button
            autofocus
            @click="index + 1 < steps.length ? index++ : emit('done')"
          >
            {{ index + 1 === steps.length ? "知道了" : "下一步" }}
          </button>
        </div>
      </div>
  </div>
</template>
<style scoped>
.tour {
  position: fixed;
  inset: 0;
  z-index: 1800;
}
.tour-light {
  position: absolute;
  border-radius: 24px;
  box-shadow: 0 0 0 200vmax #0009;
  pointer-events: none;
  transition:
    transform 0.3s,
    left 0.3s var(--ui-ease-out),
    top 0.3s var(--ui-ease-out),
    width 0.3s var(--ui-ease-out),
    height 0.3s var(--ui-ease-out),border-radius 0.3s var(--ui-ease-out);
}
.tour-note {
  position: absolute;
  left: 24px;
  right: 24px;
  max-width: 420px;
  margin: auto;
  background: var(--canvas);
  color: var(--ink);
  padding: 20px;
  border-radius: 20px;
}
.tour-note p {
  margin: 0 0 20px;
  line-height: 1.5;
}
.tour-note div {
  display: flex;
  justify-content: space-between;
}
.tour button {
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  padding: 8px 12px;
  transition: transform 0.2s;
}
.tour button:active {
  transform: scale(0.96);
}
@media (prefers-reduced-motion: reduce) {
  .tour-light,
  .tour button {
    transition: none;
  }
  .tour button:active {
    transform: none;
  }
}
</style>
