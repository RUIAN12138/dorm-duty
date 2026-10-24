<script setup lang="ts">
import { computed, useAttrs } from "vue";
import SwipeRecordCell from "./SwipeRecordCell.vue";
import type { ChoreRecord } from "../api/chores";
import "../interaction/memberNames.css";
import ChoreTypeIcon from "./ChoreTypeIcon.vue";
defineOptions({ inheritAttrs: false });
const attrs = useAttrs();
const props = defineProps<{
  record: ChoreRecord;
  own: boolean;
  editable?: boolean;
  busy?: boolean;
  testId?: string;
  swipe?: boolean;
  swipeOpen?: boolean;
}>();
const emit = defineEmits<{
  toggle: [id: number];
  edit: [];
  "update:swipeOpen": [open: boolean];
}>();
const canUndo = computed(
  () => props.own && props.record.id > 0 && !props.record.corrected,
);
const actionCount = computed(
  () => Number(canUndo.value) + Number(!!props.editable),
);
const time = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
</script>
<template>
  <SwipeRecordCell
    :enabled="swipe && actionCount > 0"
    :open="swipeOpen"
    :busy="busy"
    :count="actionCount"
    :test-id="testId"
    :label="`${record.assignee_name}的${record.name}记录`"
    @update:open="emit('update:swipeOpen', $event)"
  >
    <template #actions="{ close }">
      <button
        v-if="canUndo"
        type="button"
        :disabled="busy"
        class="swipe-undo"
        :aria-label="`撤销${record.name}打卡`"
        @click="
          close();
          emit('toggle', record.id);
        "
      >
        撤销
      </button>
      <button
        v-if="editable"
        type="button"
        :disabled="busy"
        class="swipe-edit"
        :aria-label="`修正${record.assignee_name}的${record.name}记录`"
        @click="
          close();
          emit('edit');
        "
      >
        修正
      </button>
    </template>
    <div
      v-bind="attrs"
      class="record-row"
      v-tilt
      :data-record-id="record.id"
      :class="{ 'own-record': own }"
      :data-testid="
        testId?.startsWith('calendar-list-record-') && !(swipe && actionCount)
          ? testId
          : undefined
      "
    >
      <span class="record-description"
        ><strong class="rounded-member-name">{{ record.assignee_name }}</strong
        ><span
          ><ChoreTypeIcon :type="record.key === 'water' ? 'water' : 'duty'" />{{
            record.name
          }}</span
        ></span
      >
      <span class="record-right"
        ><time :datetime="record.completed_at">{{
          time(record.completed_at)
        }}</time
        ><span class="record-completed"
          ><van-icon name="success" aria-hidden="true" />已完成</span
        ></span
      >
      <div v-if="!swipe" class="record-controls">
        <button
          v-if="own && record.id > 0 && !record.corrected"
          :disabled="busy"
          :data-testid="
            testId?.startsWith('calendar-list-record-') ? undefined : testId
          "
          :aria-label="`撤销${record.name}打卡`"
          @click="$emit('toggle', record.id)"
        >
          撤销</button
        ><button
          v-if="editable"
          :disabled="busy"
          :aria-label="`修正${record.assignee_name}的${record.name}记录`"
          @click="$emit('edit')"
        >
          修正
        </button>
      </div>
    </div>
  </SwipeRecordCell>
</template>
<style scoped>
.record-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 13px;
  min-height: 80px;
  padding: 15px 0;
  border: 0;
  border-bottom: 1px solid var(--ui-border);
  background: transparent;
  color: var(--ui-ink);
  font: inherit;
  text-align: left;
}
.record-avatar {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  border-radius: 16px;
  background: var(--app-tone-hf5f5f5, #f5f5f5);
}
.record-description {
  display: grid;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.record-description strong {
  font-size: 17px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.record-description > span {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--app-tone-h777, #777);
}
.record-description .chore-type-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
.record-right {
  display: grid;
  justify-items: end;
  gap: 7px;
  flex-shrink: 0;
}
time {
  font-size: 14px;
  color: var(--app-tone-h888, #888);
  font-variant-numeric: tabular-nums;
}
.record-completed {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--app-tone-h444, #444);
  font-size: 13px;
}
.own-record {
  cursor: pointer;
  border-radius: 12px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.own-record:active {
  transform: scaleX(0.98) scaleY(0.96);
  background: var(--app-tone-hf7f7f7, #f7f7f7);
}
.own-record:disabled {
  opacity: 0.5;
  cursor: default;
}
.own-record:focus-visible {
  outline: 2px solid var(--app-tone-h111, #111);
  outline-offset: 3px;
}
@media (prefers-reduced-motion: no-preference) {
  .own-record {
    transition:
      transform var(--ui-release-time) var(--ui-ease-out),
      background-color 140ms ease;
  }
}
@media (prefers-reduced-motion: reduce) {
  .own-record:active {
    transform: none;
  }
}
</style>

<style scoped>
.record-row {
  flex-wrap: wrap;
  cursor: default;
}
.record-description strong {
  font-size: var(--ui-body-size);
}
.record-row:active {
  transform: none !important;
}
.record-controls {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-card-gap);
  width: 100%;
}
.record-controls:empty {
  display: none;
}
.record-controls button {
  border: 0;
  background: var(--ui-surface-muted);
  border-radius: var(--ui-control-radius);
  min-height: 44px;
  padding: 0 var(--ui-space-sm);
  font: inherit;
  font-size: var(--ui-small-size);
  color: var(--ui-ink);
}
</style>
