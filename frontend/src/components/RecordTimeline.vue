<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from "vue";
import type { ChoreRecord } from "../api/chores";
import ChoreRecordRow from "./ChoreRecordRow.vue";
import { motionAllowed } from "../interaction/motion";
const props = withDefaults(
  defineProps<{
    records: ChoreRecord[];
    memberId?: number;
    busy?: boolean;
    expanded?: boolean;
    list?: boolean;
    date?: string;
    label?: string;
  }>(),
  { expanded: true },
);
const emit = defineEmits<{ undo: [id: number]; toggle: [] }>();
const root = ref<HTMLElement>(),
  header = ref<HTMLElement>(),
  entered = ref(false),
  heights = ref<number[]>([]),
  headerHeight = ref(64);
const open = computed(() => props.expanded && entered.value);
const offsets = computed(() => {
  let y = props.list ? headerHeight.value + 10 : 0;
  return props.records.map((_, i) => {
    const top = y;
    y += (heights.value[i] || 88) + 10;
    return top;
  });
});
const height = computed(() =>
  open.value
    ? props.records.length
      ? (offsets.value.at(-1) || 0) + (heights.value.at(-1) || 88)
      : props.list
        ? headerHeight.value
        : 0
    : props.list
      ? headerHeight.value + Math.min(props.records.length, 3) * 7
      : 0,
);
function style(index: number) {
  const depth = Math.min(index + 1, 3);
  return {
    zIndex: props.records.length - index,
    height: `${open.value ? heights.value[index] || 88 : headerHeight.value}px`,
    transform: open.value
      ? `translate3d(0,${offsets.value[index]}px,0) scale(1) rotate(0deg)`
      : `translate3d(0,${depth * 7}px,0) scale(${1 - depth * 0.028}) rotate(${index % 2 ? -depth * 0.45 : depth * 0.45}deg)`,
    opacity: open.value || (props.list && index < 3) ? 1 : 0,
    "--record-delay": `${Math.min(open.value ? index : props.records.length - 1 - index, 6) * 45}ms`,
  };
}
let observer: ResizeObserver | undefined,
  frame = 0;
function measure() {
  headerHeight.value = header.value?.offsetHeight || 64;
  heights.value = Array.from(
    root.value?.querySelectorAll<HTMLElement>(".record-card-content") || [],
    (el) => el.offsetHeight,
  );
}
function observe() {
  observer?.disconnect();
  measure();
  if (root.value) {
    observer = new ResizeObserver(measure);
    root.value
      .querySelectorAll(".record-card-content")
      .forEach((el) => observer?.observe(el));
    if (header.value) observer.observe(header.value);
  }
}
onMounted(() => {
  observe();
  frame = requestAnimationFrame(() => {
    entered.value = true;
  });
});
watch(
  () => props.records.map((r) => r.id).join(","),
  async () => {
    await nextTick();
    observe();
  },
);
onBeforeUnmount(() => {
  observer?.disconnect();
  cancelAnimationFrame(frame);
});
</script>
<template>
  <section
    ref="root"
    class="record-stack"
    :class="{
      'is-expanded': open,
      'is-stacked': list && !open,
      'quiet-motion': !motionAllowed(),
    }"
    :style="{ height: `${height}px` }"
    data-testid="record-stack"
  >
    <button
      v-if="list"
      ref="header"
      class="records-heading"
      :style="{ zIndex: records.length + 1 }"
      :aria-expanded="expanded"
      :aria-controls="`records-${date}`"
      :data-testid="`record-group-${date}`"
      @click="emit('toggle')"
    >
      <h2>{{ label }}</h2>
      <span
        >{{ records.length }}<van-icon name="arrow-down" aria-hidden="true"
      /></span>
    </button>
    <div
      :id="date ? `records-${date}` : undefined"
      class="record-stack-body"
      :inert="!expanded ? true : undefined"
      :aria-hidden="!expanded"
    >
      <div
        v-for="(record, index) in records"
        :key="record.id"
        class="record-stagger"
        :style="style(index)"
      >
        <div class="record-card-content">
          <ChoreRecordRow
            :class="{ 'calendar-record': !list }"
            :record="record"
            :own="record.assignee_id === memberId"
            :busy="busy"
            :test-id="
              list
                ? `calendar-list-record-${record.id}`
                : record.assignee_id === memberId
                  ? `calendar-undo-${record.id}`
                  : undefined
            "
            @toggle="emit('undo', $event)"
          />
        </div>
      </div>
    </div>
  </section>
</template>
<style scoped>
.record-stack {
  position: relative;
  isolation: isolate;
  margin: 10px 0 24px;
  transition: height 460ms cubic-bezier(0.22, 0.8, 0.3, 1);
  overflow: visible;
}
.record-stack-body {
  position: absolute;
  inset: 0;
  pointer-events: none;
  perspective: 800px;
}
.records-heading {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 64px;
  padding: 18px 17px;
  border: 1px solid #e9e9e9;
  border-radius: 20px;
  background: #fff;
  font: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 2px 4px #00000003;
}
h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.4px;
}
.records-heading > span {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #888;
  font-size: 14px;
}
.van-icon {
  transition: transform 320ms ease;
}
.is-expanded .van-icon {
  transform: rotate(180deg);
}
.record-stagger {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  border: 1px solid #e7e7e7;
  border-radius: 20px;
  background: #f9f9f9;
  box-shadow: 0 3px 6px #00000005;
  overflow: hidden;
  transform-origin: 50% 0;
  pointer-events: none;
  transition:
    transform 520ms cubic-bezier(0.18, 0.85, 0.25, 1.08) var(--record-delay),
    opacity 260ms ease var(--record-delay),
    height 420ms cubic-bezier(0.22, 0.8, 0.3, 1);
}
.is-expanded .record-stagger {
  background: #fff;
  pointer-events: auto;
}
.record-card-content {
  opacity: 0;
  transform: translateX(18px);
  transition:
    opacity 180ms ease,
    transform 240ms ease;
}
.is-expanded .record-card-content {
  opacity: 1;
  transform: translateX(0);
  transition:
    opacity 280ms ease calc(var(--record-delay) + 70ms),
    transform 460ms cubic-bezier(0.22, 1, 0.36, 1) var(--record-delay);
}
:deep(.record-row) {
  min-height: 86px;
  padding: 14px 16px;
  border: 0;
  border-radius: 19px;
  background: transparent;
}
:deep(.record-avatar) {
  width: 36px;
  height: 36px;
  border-radius: 12px;
}
.quiet-motion,
.quiet-motion * {
  transition: none !important;
}
.quiet-motion .record-card-content {
  transform: none;
}
@media (prefers-reduced-motion: reduce) {
  .record-stack,
  .record-stack * {
    transition: none !important;
  }
}
</style>
