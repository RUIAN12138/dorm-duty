<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import type { ChoreRecord } from "../api/chores";
import ChoreRecordRow from "./ChoreRecordRow.vue";
const props = withDefaults(
  defineProps<{
    records: ChoreRecord[];
    memberId?: number;
    busy?: boolean;
    expanded?: boolean;
    list?: boolean;
    date?: string;
    label?: string;
    editable?: boolean;
    creator?: boolean;
    undoIds?: number[];
    appearDelay?: number;
  }>(),
  { expanded: true, appearDelay: 0 },
);
const emit = defineEmits<{
  undo: [id: number];
  toggle: [];
  edit: [record: ChoreRecord];
  "before-layout": [];
  "after-layout": [];
  "collapse-start": [element: HTMLElement, distance: number, duration: number];
}>();
const root = ref<HTMLElement>();
const collapsing = ref(false);
const leavingElements = new Set<Element>();
const positions = new WeakMap<Element, { top: number; width: number }>();
watch(
  () => props.expanded,
  (next, previous) => {
    const body = root.value?.querySelector<HTMLElement>(".record-stack-body");
    if (!body) return;
    if (next) {
      collapsing.value = false;
      body.style.removeProperty("min-height");
      return;
    }
    if (!previous) return;
    // Keep the scroll extent until the last visible card has faded away.
    // Removing it immediately clamps scrollTop before FLIP can compensate.
    const height = body.getBoundingClientRect().height;
    body.style.minHeight = `${height}px`;
    collapsing.value = true;
    const top = body.getBoundingClientRect().top;
    body.querySelectorAll(".record-stagger").forEach((el) => {
      const box = el.getBoundingClientRect();
      positions.set(el, { top: box.top - top, width: box.width });
    });
    if (root.value)
      emit(
        "collapse-start",
        root.value,
        height,
        260 + Math.min(Math.max(0, props.records.length - 1), 5) * 18,
      );
  },
  { flush: "pre" },
);
function leaving(el: Element) {
  leavingElements.add(el);
  const at = positions.get(el);
  if (!(el instanceof HTMLElement) || !at) return;
  el.style.top = `${at.top}px`;
  el.style.width = `${at.width}px`;
  el.style.setProperty("--record-fold-y", `${-Math.min(72, at.top + 12)}px`);
}
function finishLeaving(el: Element) {
  leavingElements.delete(el);
  if (leavingElements.size || props.expanded || !collapsing.value) return;
  emit("before-layout");
  root.value
    ?.querySelector<HTMLElement>(".record-stack-body")
    ?.style.removeProperty("min-height");
  collapsing.value = false;
  void nextTick(() => emit("after-layout"));
}
function entering(el: Element) {
  leavingElements.delete(el);
  if (!(el instanceof HTMLElement)) return;
  el.style.removeProperty("top");
  el.style.removeProperty("width");
  el.style.removeProperty("--record-fold-y");
}
</script>
<template>
  <section
    ref="root"
    class="record-stack"
    :class="{
      'is-expanded': expanded,
      'is-collapsing': collapsing,
      'is-stacked': list && !expanded && !collapsing,
      'is-list': list,
    }"
    data-testid="record-stack"
  >
    <button
      v-if="list"
      class="records-heading"
      :aria-expanded="expanded"
      :aria-controls="`records-${date}`"
      :data-testid="`record-group-${date}`"
      @click="emit('toggle')"
    >
      <h2>{{ label }}</h2>
      <span
        >{{ records.length }}项<van-icon name="arrow-down" aria-hidden="true"
      /></span>
    </button>
    <TransitionGroup
      :id="date ? `records-${date}` : undefined"
      name="record-reveal"
      tag="div"
      class="record-stack-body"
      appear
      @before-leave="leaving"
      @after-leave="finishLeaving"
      @leave-cancelled="finishLeaving"
      @before-enter="entering"
    >
      <div
        v-for="(record, index) in expanded ? records : []"
        :key="record.id"
        class="record-stagger"
        :style="{
          '--record-delay': `${appearDelay + Math.min(index, 8) * (appearDelay ? 28 : 32)}ms`,
          '--record-exit-delay': `${Math.min(Math.max(0, records.length - index - 1), 5) * 18}ms`,
        }"
      >
        <ChoreRecordRow
          :class="{ 'calendar-record': !list }"
          :record="record"
          :own="
            record.assignee_id === memberId &&
            record.id > 0 &&
            !!undoIds?.includes(record.id)
          "
          :editable="editable && (creator || record.assignee_id === memberId)"
          :busy="busy"
          :test-id="
            list
              ? `calendar-list-record-${record.id}`
              : `calendar-undo-${record.id}`
          "
          @toggle="emit('undo', $event)"
          @edit="emit('edit', record)"
        />
      </div>
    </TransitionGroup>
  </section>
</template>
<style scoped>
.record-stack {
  position: relative;
  isolation: isolate;
  margin: var(--ui-space-md) 0;
}
.records-heading {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 60px;
  padding: var(--ui-card-padding);
  border: var(--ui-card-border);
  border-radius: 18px;
  background: var(--ui-surface);
  font: inherit;
  text-align: left;
  cursor: pointer;
  animation: record-heading-arrive 280ms var(--ui-ease-out)
    var(--group-delay, 0ms) both;
}
.records-heading .van-icon {
  transition: transform 180ms var(--ui-ease-out);
}
.is-expanded .records-heading .van-icon {
  transform: rotate(180deg);
}
@keyframes record-heading-arrive {
  from {
    opacity: 0;
    transform: translate3d(32px, 0, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}
.records-heading h2 {
  margin: 0;
  font-size: 18px;
  line-height: var(--ui-title-leading);
}
.records-heading span {
  display: flex;
  gap: var(--ui-card-gap);
  align-items: center;
  font-size: var(--ui-small-size);
  color: var(--ui-text-muted);
}
.is-list::before,
.is-list::after {
  content: "";
  position: absolute;
  inset: 5px 6px auto;
  height: 60px;
  box-sizing: border-box;
  z-index: -1;
  background: var(--ui-surface-muted);
  border: var(--ui-card-border);
  border-radius: var(--ui-card-radius);
  pointer-events: none;
  opacity: 0;
  transform: translate3d(0, -6px, 0) scaleX(0.985);
  transition:
    opacity 220ms var(--ui-ease-out),
    transform 260ms var(--ui-ease-out);
}
.is-list::after {
  inset: 10px 12px auto;
  z-index: -2;
  background: var(--ui-surface);
}
.is-list.is-collapsing::before,
.is-list.is-collapsing::after,
.is-list.is-stacked::before,
.is-list.is-stacked::after {
  opacity: 1;
  transform: translate3d(0, 0, 0) scaleX(1);
}
.is-list.is-collapsing::before {
  transition-delay: 70ms;
}
.is-list.is-collapsing::after {
  transition-delay: 110ms;
}
.record-stack-body {
  box-sizing: border-box;
  position: relative;
  display: grid;
  gap: var(--ui-card-gap);
}
.record-stagger {
  border: var(--ui-card-border);
  border-radius: 16px;
  background: var(--ui-surface);
  padding: 0 var(--ui-card-padding);
}
.records-heading + .record-stack-body:not(:empty) {
  padding-top: var(--ui-card-gap);
}
.record-reveal-enter-active {
  transition:
    transform 300ms var(--ui-ease-out) var(--record-delay),
    opacity 260ms var(--ui-ease-out) var(--record-delay);
}
.record-reveal-leave-active {
  transition:
    transform 260ms var(--ui-ease-out) var(--record-exit-delay),
    opacity 220ms var(--ui-ease-out) var(--record-exit-delay);
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
}
.record-reveal-enter-from {
  opacity: 0;
  transform: translate3d(44px, 0, 0) scale(0.985);
}
.record-reveal-leave-to {
  opacity: 0;
  transform: translate3d(32px, var(--record-fold-y, -12px), 0) scale(0.985);
}
.record-reveal-move {
  transition: transform 300ms var(--ui-ease-out);
}
@media (prefers-reduced-motion: reduce) {
  .records-heading {
    animation: none;
  }
  .records-heading .van-icon {
    transition: none;
  }
  .record-reveal-enter-from,
  .record-reveal-leave-to {
    transform: none;
    opacity: 1;
  }
  .record-reveal-enter-active,
  .record-reveal-leave-active,
  .record-reveal-move {
    transition: none;
  }
}
</style>
