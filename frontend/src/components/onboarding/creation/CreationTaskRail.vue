<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { motionAllowed } from "../../../interaction/motion";
const props = defineProps<{
  tasks: { key: string; name: string }[];
  modelValue: string | null;
  label: string;
}>();
const emit = defineEmits<{ "update:modelValue": [key: string] }>();
const rail = ref<HTMLElement>();
let revision = 0;
async function reveal() {
  const current = ++revision;
  await nextTick();
  if (current !== revision || !rail.value) return;
  const host = rail.value;
  const selected = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.dataset.taskKey === props.modelValue,
  );
  if (!selected) return;
  // Scroll only this row; scrollIntoView can move the entire wizard on Safari.
  const r = host.getBoundingClientRect(),
    item = selected.getBoundingClientRect();
  const delta =
    item.left < r.left + 4
      ? item.left - r.left - 4
      : item.right > r.right - 4
        ? item.right - r.right + 4
        : 0;
  if (delta)
    host.scrollTo({
      left: host.scrollLeft + delta,
      behavior: motionAllowed() ? "smooth" : "instant",
    });
}
function keydown(event: KeyboardEvent, index: number) {
  const next =
    event.key === "ArrowRight"
      ? index + 1
      : event.key === "ArrowLeft"
        ? index - 1
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? props.tasks.length - 1
            : -1;
  if (next < 0 || next >= props.tasks.length) return;
  event.preventDefault();
  emit("update:modelValue", props.tasks[next]!.key);
  rail.value
    ?.querySelectorAll<HTMLButtonElement>("button")
    [next]?.focus({ preventScroll: true });
}
watch(
  () => [
    props.modelValue,
    props.tasks.map((task) => `${task.key}:${task.name}`).join("|"),
  ],
  reveal,
);
onMounted(reveal);
</script>
<template>
  <div
    ref="rail"
    class="creation-task-rail"
    role="group"
    :aria-label="label"
    data-native-scroll
  >
    <button
      v-for="(task, index) in tasks"
      :key="task.key"
      type="button"
      :data-task-key="task.key"
      :aria-label="task.name || '未命名任务'"
      :aria-pressed="modelValue === task.key"
      :class="{ selected: modelValue === task.key }"
      @click="emit('update:modelValue', task.key)"
      @keydown="keydown($event, index)"
    >
      {{ task.name || "未命名任务" }}
    </button>
  </div>
</template>
<style scoped>
.creation-task-rail {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  padding: 3px 2px 5px;
  touch-action: pan-x pan-y;
}
.creation-task-rail::-webkit-scrollbar {
  display: none;
}
button {
  flex: 0 0 auto;
  min-width: 54px;
  max-width: 156px;
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--canvas);
  color: var(--muted);
  font: inherit;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition:
    transform 180ms var(--ui-ease-out),
    background-color 160ms,
    color 160ms,
    border-color 160ms;
}
button.selected {
  background: color-mix(in srgb, var(--ink) 5%, var(--canvas));
  border-color: color-mix(in srgb, var(--ink) 45%, var(--line));
  color: var(--ink);
}
button:active {
  transform: scale(0.97);
}
button:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: -3px;
}
@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
  button:active {
    transform: none;
  }
}
</style>
