<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted } from "vue";
import { registerNativeBack } from "../interactions/nativeBack";
let removeNativeBack: (() => void) | undefined;
const props = defineProps<{
  modelValue: boolean;
  title: string;
  origin?: DOMRect | null;
  motion?: "shared" | "bottom";
}>();
const bottomOnly = computed(() => props.motion === "bottom");
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  closed: [];
}>();
const panel = ref<HTMLElement>();
let lastFocus: HTMLElement | null = null,
  previousOverflow = "",
  dragging = false,
  startY = 0,
  lastY = 0,
  lastTime = 0,
  speed = 0,
  dragBaseline = 0,
  offset = 0;
let animation: Animation | undefined;
let scrimAnimation: Animation | undefined;
let settleEnter: (() => void) | undefined;
let locked = false;
const reduce = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.documentElement.dataset.interaction === "keyboard";
let closing = false,
  exitAnimating = false;
async function close() {
  if (closing) return;
  closing = true;
  if (panel.value && !bottomOnly.value && props.origin && !reduce()) {
    animation?.cancel();
    exitAnimating = true;
    const to = props.origin,
      from = panel.value.getBoundingClientRect();
    animation = panel.value.animate(
      [
        { transformOrigin: "top left", transform: "none", opacity: 1 },
        {
          transformOrigin: "top left",
          transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`,
          opacity: 0.2,
        },
      ],
      { duration: 180, easing: "cubic-bezier(.32,0,.67,0)", fill: "forwards" },
    );
    await animation.finished.catch(() => {});
  }
  emit("update:modelValue", false);
}
function down(e: PointerEvent) {
  if (
    !panel.value ||
    closing ||
    dragging ||
    !e.isPrimary ||
    e.button !== 0 ||
    (e.target instanceof Element &&
      e.target.closest("button, input, textarea, select, a, [contenteditable='true']"))
  )
    return;
  dragBaseline = bottomOnly.value
    ? new DOMMatrixReadOnly(getComputedStyle(panel.value).transform).m42
    : 0;
  settleEnter?.();
  animation?.cancel();
  panel.value.style.transform = `translateY(${dragBaseline}px)`;
  dragging = true;
  startY = lastY = e.clientY;
  lastTime = performance.now();
  speed = 0;
  offset = dragBaseline;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
async function closeByDrag() {
  if (closing) return;
  closing = true;
  if (panel.value && !reduce()) {
    animation?.cancel();
    exitAnimating = true;
    const from = getComputedStyle(panel.value).transform;
    animation = panel.value.animate(
      [
        { transform: from, offset: 0 },
        {
          transform: "translateY(102%)",
          offset: 0.82,
          easing: "cubic-bezier(.4,0,.7,.2)",
        },
        { transform: "translateY(96%)", offset: 0.92 },
        { transform: "translateY(100%)", offset: 1 },
      ],
      {
        duration: 280,
        easing: "cubic-bezier(.22,1,.36,1)",
        fill: "forwards",
      },
    );
    await animation.finished.catch(() => {});
  }
  emit("update:modelValue", false);
}
function move(e: PointerEvent) {
  if (!dragging || !panel.value) return;
  const now = performance.now();
  speed = (e.clientY - lastY) / Math.max(now - lastTime, 1);
  lastY = e.clientY;
  lastTime = now;
  const delta = dragBaseline + e.clientY - startY;
  offset = delta < 0 ? -Math.abs(delta) / (1 + Math.abs(delta) / 70) : delta;
  panel.value.style.transform = `translateY(${offset}px)`;
}
function up(cancelled = false) {
  if (!dragging || !panel.value) return;
  dragging = false;
  if (performance.now() - lastTime > 80) speed = 0;
  if (!cancelled && (offset > 130 || (offset > 35 && speed > 0.6))) {
    if (bottomOnly.value) close();
    else void closeByDrag();
    return;
  }
  if (!reduce())
    animation = panel.value.animate(
      [
        { transform: `translateY(${offset}px)` },
        { transform: "translateY(0)" },
      ],
      { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" },
    );
  panel.value.style.transform = "";
  offset = 0;
}
function bottomTransition(
  element: Element,
  done: () => void,
  entering: boolean,
) {
  const sheet = element.querySelector<HTMLElement>(".elastic-sheet");
  const scrim = element.querySelector<HTMLElement>(".sheet-scrim");
  if (!sheet || reduce()) {
    done();
    return;
  }
  const from = entering
    ? "translate3d(0,100%,0)"
    : getComputedStyle(sheet).transform;
  const scrimFrom = entering
    ? 0
    : Number(scrim ? getComputedStyle(scrim).opacity : 1);
  settleEnter?.();
  animation?.cancel();
  scrimAnimation?.cancel();
  animation = sheet.animate(
    entering
      ? [
          { transform: from },
          { transform: "translate3d(0,0,0)" },
        ]
      : [
          { transform: from, offset: 0 },
          {
            transform: "translate3d(0,102%,0)",
            offset: 0.82,
            easing: "cubic-bezier(.4,0,.7,.2)",
          },
          { transform: "translate3d(0,96%,0)", offset: 0.92 },
          { transform: "translate3d(0,100%,0)", offset: 1 },
        ],
    {
      duration: entering ? 300 : 280,
      easing: entering ? "cubic-bezier(.32,.72,0,1)" : "cubic-bezier(.22,1,.36,1)",
      fill: "both",
    },
  );
  scrimAnimation = scrim?.animate(
    [{ opacity: scrimFrom }, { opacity: entering ? 1 : 0 }],
    { duration: entering ? 240 : 220, easing: "ease-out", fill: "both" },
  );
  const finish = () => {
    if (entering) settleEnter = undefined;
    done();
  };
  if (entering) settleEnter = finish;
  animation.finished.then(finish).catch(() => {});
}
function enterBottom(element: Element, done: () => void) {
  bottomTransition(element, done, true);
}
function leaveBottom(element: Element, done: () => void) {
  bottomTransition(element, done, false);
}
function afterEnter() {
  if (!bottomOnly.value || !props.modelValue) return;
  animation?.cancel();
  scrimAnimation?.cancel();
  if (panel.value) panel.value.style.transform = "";
}
function afterLeave() {
  animation?.cancel();
  scrimAnimation?.cancel();
  exitAnimating = false;
  closing = false;
  removeNativeBack?.();
  removeNativeBack = undefined;
  restore();
  emit("closed");
}
function key(e: KeyboardEvent) {
  if (!props.modelValue) return;
  const confirmation = document.querySelector<HTMLElement>(".van-dialog");
  if (confirmation && confirmation.getBoundingClientRect().height > 0) return;
  if (e.key === "Escape") close();
  if (e.key === "Tab" && panel.value) {
    const items = [
      ...panel.value.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
      ),
    ];
    const first = items[0],
      last = items.at(-1);
    if (!items.length) {
      e.preventDefault();
      panel.value.focus();
    } else if (
      e.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === panel.value)
    ) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
}
function restore() {
  if (!locked) return;
  locked = false;
  document.body.style.overflow = previousOverflow;
  window.removeEventListener("keydown", key);
  lastFocus?.focus({ preventScroll: true });
}
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      if (!bottomOnly.value && !exitAnimating) animation?.cancel();
      dragging = false;
      return;
    }
    lastFocus = document.activeElement as HTMLElement;
    removeNativeBack = registerNativeBack(() => void close());
    previousOverflow = document.body.style.overflow;
    locked = true;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", key);
    await nextTick();
    if (!panel.value) return;
    panel.value.style.transform = "";
    if (!reduce() && !bottomOnly.value && props.origin) {
      const from = props.origin,
        to = panel.value.getBoundingClientRect();
      const x = from.left - to.left,
        y = from.top - to.top;
      animation = panel.value.animate(
        [
          {
            transformOrigin: "top left",
            transform: `translate(${x}px, ${y}px) scale(${from.width / to.width}, ${from.height / to.height})`,
            borderRadius: "28px",
            opacity: 0.6,
          },
          {
            transformOrigin: "top left",
            transform: "none",
            borderRadius: "28px",
            opacity: 1,
          },
        ],
        { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" },
      );
    }
    panel.value.focus({ preventScroll: true });
  },
);
onUnmounted(() => {
  removeNativeBack?.();
  animation?.cancel();
  scrimAnimation?.cancel();
  restore();
});
</script>
<template>
  <Teleport to="body">
    <Transition
      name="sheet"
      :css="!bottomOnly"
      :on-enter="bottomOnly ? enterBottom : undefined"
      :on-leave="bottomOnly ? leaveBottom : undefined"
      @after-enter="afterEnter"
      @after-leave="afterLeave"
    >
      <div
        v-if="modelValue"
        class="sheet-layer"
        :data-motion="bottomOnly ? 'bottom' : 'shared'"
      >
        <div class="sheet-scrim" @click="close" aria-hidden="true"></div>
        <section
          ref="panel"
          class="elastic-sheet"
          :class="{ 'is-bottom-sheet': bottomOnly }"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
        >
          <div
            class="sheet-handle"
            @pointerdown="down"
            @pointermove="move"
            @pointerup="up(false)"
            @pointercancel="up(true)"
          >
            <span></span>
          </div>
          <header
            class="sheet-heading"
            @pointerdown="down"
            @pointermove="move"
            @pointerup="up(false)"
            @pointercancel="up(true)"
          >
            <div>
              <h2>{{ title }}</h2>
            </div>
            <button type="button" aria-label="关闭详情" @click="close">
              <van-icon name="cross" />
            </button>
          </header>
          <div class="sheet-content"><slot /></div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
