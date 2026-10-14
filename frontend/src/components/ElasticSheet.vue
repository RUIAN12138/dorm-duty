<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from "vue";
import { registerNativeBack } from "../interactions/nativeBack";
let removeNativeBack: (() => void) | undefined;
const props = defineProps<{
  modelValue: boolean;
  title: string;
  origin?: DOMRect | null;
}>();
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
  offset = 0;
let animation: Animation | undefined;
const reduce = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.documentElement.dataset.interaction === "keyboard";
let closing = false,
  exitAnimating = false;
async function close() {
  if (closing) return;
  closing = true;
  if (panel.value && props.origin && !reduce()) {
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
  closing = false;
}
function down(e: PointerEvent) {
  if (!panel.value || dragging || !e.isPrimary) return;
  animation?.cancel();
  dragging = true;
  startY = lastY = e.clientY;
  lastTime = performance.now();
  speed = 0;
  offset = 0;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (!dragging || !panel.value) return;
  const now = performance.now();
  speed = (e.clientY - lastY) / Math.max(now - lastTime, 1);
  lastY = e.clientY;
  lastTime = now;
  const delta = e.clientY - startY;
  offset = delta < 0 ? -Math.abs(delta) / (1 + Math.abs(delta) / 70) : delta;
  panel.value.style.transform = `translateY(${offset}px)`;
}
function up(cancelled = false) {
  if (!dragging || !panel.value) return;
  dragging = false;
  if (!cancelled && (offset > 130 || (offset > 35 && speed > 0.6))) {
    close();
    return;
  }
  if (!reduce())
    animation = panel.value.animate(
      [
        { transform: `translateY(${offset}px)` },
        { transform: "translateY(-4px)", offset: 0.65 },
        { transform: "translateY(0)" },
      ],
      { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" },
    );
  panel.value.style.transform = "";
  offset = 0;
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
  document.body.style.overflow = previousOverflow;
  window.removeEventListener("keydown", key);
  lastFocus?.focus({ preventScroll: true });
}
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      removeNativeBack?.();
      removeNativeBack = undefined;
      if (!exitAnimating) animation?.cancel();
      dragging = false;
      restore();
      return;
    }
    lastFocus = document.activeElement as HTMLElement;
    removeNativeBack = registerNativeBack(() => void close());
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", key);
    await nextTick();
    if (!panel.value) return;
    panel.value.style.transform = "";
    if (!reduce() && props.origin) {
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
  if (props.modelValue) restore();
});
</script>
<template>
  <Teleport to="body">
    <Transition
      name="sheet"
      @after-leave="
        animation?.cancel();
        exitAnimating = false;
        emit('closed');
      "
    >
      <div v-if="modelValue" class="sheet-layer">
        <div class="sheet-scrim" @click="close" aria-hidden="true"></div>
        <section
          ref="panel"
          class="elastic-sheet"
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
          <header class="sheet-heading">
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
