<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import type { ChoreReminder } from "../api/chores";
import { createVelocityTracker } from "../interaction/gestures";
import { motionAllowed } from "../interaction/motion";
const props = defineProps<{ note: ChoreReminder | null }>();
const emit = defineEmits<{ dismiss: []; open: []; settled: [id?: number] }>();
const offset = ref(0),
  dragging = ref(false);
let gesture: {
  id: number;
  x: number;
  y: number;
  element: HTMLElement;
  velocity: ReturnType<typeof createVelocityTracker>;
} | null = null;
let suppressUntil = 0;
function down(event: PointerEvent) {
  if (
    !event.isPrimary ||
    event.button !== 0 ||
    gesture ||
    (event.target as Element).closest("[data-banner-close]")
  )
    return;
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    element: event.currentTarget as HTMLElement,
    velocity: createVelocityTracker(event.clientY, performance.now()),
  };
}
function move(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const y = event.clientY - gesture.y,
    x = event.clientX - gesture.x;
  if (!dragging.value && y < -8 && Math.abs(y) > Math.abs(x) * 1.2) {
    dragging.value = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  if (!dragging.value) return;
  gesture.velocity.add(event.clientY, performance.now());
  offset.value = Math.min(0, y);
}
function finish(event: PointerEvent, cancelled = false) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const close =
    !cancelled &&
    dragging.value &&
    (offset.value < -45 ||
      (offset.value < -16 && gesture.velocity.read(performance.now()) < -0.5));
  if (dragging.value) suppressUntil = performance.now() + 500;
  gesture = null;
  dragging.value = false;
  const el = event.currentTarget as HTMLElement;
  if (el.hasPointerCapture(event.pointerId))
    el.releasePointerCapture(event.pointerId);
  if (close) emit("dismiss");
  else offset.value = 0;
}
function open() {
  if (performance.now() >= suppressUntil) emit("open");
}
function afterLeave(element?: Element) {
  if (!props.note) cancelGesture();
  const id = element?.getAttribute("data-reminder-id");
  emit("settled", id ? Number(id) : undefined);
}
function cancelGesture() {
  const current = gesture;
  gesture = null;
  dragging.value = false;
  offset.value = 0;
  if (current?.element.hasPointerCapture(current.id))
    current.element.releasePointerCapture(current.id);
}
function inactive() {
  if (!motionAllowed()) cancelGesture();
}
const media = matchMedia("(prefers-reduced-motion: reduce)");
onMounted(() => {
  window.addEventListener("blur", cancelGesture);
  window.addEventListener("ui-motion-change", inactive);
  document.addEventListener("visibilitychange", inactive);
  media.addEventListener("change", inactive);
});
onBeforeUnmount(() => {
  cancelGesture();
  window.removeEventListener("blur", cancelGesture);
  window.removeEventListener("ui-motion-change", inactive);
  document.removeEventListener("visibilitychange", inactive);
  media.removeEventListener("change", inactive);
});
</script>
<template>
  <Teleport to="body">
    <div class="reminder-banner-position">
      <Transition
        name="reminder-banner"
        @before-enter="cancelGesture"
        @after-leave="afterLeave"
      >
        <section
          v-if="note"
          :key="note.id"
          class="reminder-banner-motion"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="reminder-banner"
          :data-reminder-id="note.id"
          @keydown.esc.stop="emit('dismiss')"
        >
          <div
            class="reminder-banner-card"
            :class="{ 'is-dragging': dragging }"
            :style="{ transform: `translateY(${offset}px)` }"
            @pointerdown="down"
            @pointermove="move"
            @pointerup="finish($event)"
            @pointercancel="finish($event, true)"
            @lostpointercapture="finish($event, true)"
            @click="open"
          >
            <button
              type="button"
              class="reminder-banner-main"
              :aria-label="`${note.sender_name || '室友'}提醒你，${note.task_name || '完成宿舍任务'}，查看消息`"
            >
              <span class="reminder-banner-caption"
                >{{ note.sender_name || "室友" }}提醒你</span
              >
              <strong>{{ note.task_name || "完成宿舍任务" }}</strong>
              <span
                v-if="note.body && note.body !== note.task_name"
                class="reminder-banner-body"
                >{{ note.body }}</span
              >
            </button>
            <button
              type="button"
              class="reminder-banner-close"
              data-banner-close
              aria-label="收起提醒"
              @click.stop="emit('dismiss')"
            >
              ×
            </button>
          </div>
        </section>
      </Transition>
    </div>
  </Teleport>
</template>
<style scoped>
.reminder-banner-position {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 14px);
  left: 50%;
  width: min(420px, calc(100% - 24px));
  transform: translateX(-50%);
  z-index: 2900;
  pointer-events: none;
}
.reminder-banner-card {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 12px 10px 12px 18px;
  background: var(--ui-surface, #fff);
  border: 1px solid #e5e5e5;
  border-radius: 22px;
  box-shadow: 0 8px 32px #00000016;
  pointer-events: auto;
  touch-action: pan-x;
  transition: transform 200ms var(--ui-ease-out);
}
.reminder-banner-card.is-dragging {
  transition: none;
}
.reminder-banner-main {
  display: grid;
  gap: 4px;
  min-width: 0;
  flex: 1;
  text-align: left;
  color: #111;
  background: none;
  border: 0;
  padding: 6px 0;
  font: inherit;
}
.reminder-banner-caption {
  font-size: 13px;
  color: #666;
}
.reminder-banner-main strong {
  font-size: 21px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.reminder-banner-body {
  font-size: 14px;
  color: #555;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.reminder-banner-close {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
  color: #777;
  font: inherit;
  font-size: 25px;
}
.reminder-banner-enter-active,
.reminder-banner-leave-active {
  transition:
    transform 250ms var(--ui-ease-soft),
    opacity 200ms ease;
}
.reminder-banner-enter-from,
.reminder-banner-leave-to {
  transform: translateY(calc(-100% - env(safe-area-inset-top) - 30px));
  opacity: 0;
}
.reminder-banner-leave-active .reminder-banner-card {
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .reminder-banner-card,
  .reminder-banner-enter-active,
  .reminder-banner-leave-active {
    transition: none;
  }
}
</style>
