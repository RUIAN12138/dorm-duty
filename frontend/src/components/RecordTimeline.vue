<script setup lang="ts">
import type { ChoreRecord } from "../api/chores";
import ChoreRecordRow from "./ChoreRecordRow.vue";
withDefaults(
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
  }>(),
  { expanded: true },
);
const emit = defineEmits<{
  undo: [id: number];
  toggle: [];
  edit: [record: ChoreRecord];
}>();
</script>
<template>
  <section
    class="record-stack"
    :class="{ 'is-expanded': expanded, 'is-stacked': list && !expanded }"
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
    >
      <div
        v-for="(record, index) in expanded ? records : []"
        :key="record.id"
        class="record-stagger"
        :style="{ '--record-delay': `${Math.min(index, 4) * 40}ms` }"
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
  min-height: 64px;
  padding: var(--ui-card-padding);
  border: var(--ui-card-border);
  border-radius: var(--ui-card-radius);
  background: var(--ui-surface);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.records-heading h2 {
  margin: 0;
  font-size: var(--ui-card-title-size);
  line-height: var(--ui-title-leading);
}
.records-heading span {
  display: flex;
  gap: var(--ui-card-gap);
  align-items: center;
  font-size: var(--ui-small-size);
  color: var(--ui-text-muted);
}
.is-stacked::before,
.is-stacked::after {
  content: "";
  position: absolute;
  inset: 0 6px -5px;
  z-index: -1;
  background: var(--ui-surface-muted);
  border: var(--ui-card-border);
  border-radius: var(--ui-card-radius);
  pointer-events: none;
}
.is-stacked::after {
  inset: 0 12px -10px;
  z-index: -2;
  background: var(--ui-surface);
}
.record-stack-body {
  display: grid;
  gap: var(--ui-card-gap);
}
.record-stagger {
  border: var(--ui-card-border);
  border-radius: var(--ui-card-radius);
  background: var(--ui-surface);
  padding: 0 var(--ui-card-padding);
}
.records-heading + .record-stack-body:not(:empty) {
  padding-top: var(--ui-card-gap);
}
.record-reveal-enter-active {
  transition:
    transform 240ms var(--ui-ease-enter) var(--record-delay),
    opacity 240ms var(--ui-ease-enter) var(--record-delay);
}
.record-reveal-leave-active {
  transition: opacity 180ms var(--ui-ease-out);
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
}
.record-reveal-enter-from {
  opacity: 0;
  transform: translate3d(12px, 8px, 0);
}
.record-reveal-leave-to {
  opacity: 0;
}
.record-reveal-move {
  transition: transform 300ms var(--ui-ease-out);
}
@media (prefers-reduced-motion: reduce) {
  .record-reveal-enter-active,
  .record-reveal-leave-active,
  .record-reveal-move {
    transition: none;
  }
}
</style>
