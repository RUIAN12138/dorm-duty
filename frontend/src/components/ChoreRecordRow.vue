<script setup lang="ts">
import type { ChoreRecord } from "../api/chores";
import MemberMark from "./MemberMark.vue";
import ChoreTypeIcon from "./ChoreTypeIcon.vue";
defineProps<{
  record: ChoreRecord;
  own: boolean;
  busy?: boolean;
  testId?: string;
}>();
defineEmits<{ toggle: [id: number] }>();
const time = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
</script>
<template>
  <component
    :is="own ? 'button' : 'div'"
    class="record-row"
    :class="{ 'own-record': own }"
    :type="own ? 'button' : undefined"
    :disabled="own ? busy : undefined"
    :data-testid="testId"
    :aria-label="
      own
        ? `${record.assignee_name}，${record.name}已完成，再次点击撤销打卡`
        : undefined
    "
    @click="own && !busy && $emit('toggle', record.id)"
  >
    <span class="record-avatar"
      ><MemberMark :id="record.marker_id" :size="26"
    /></span>
    <span class="record-description"
      ><strong>{{ record.assignee_name }}</strong
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
      ><span v-if="own" class="record-completed"
        ><van-icon name="success" aria-hidden="true" />已完成</span
      ></span
    >
  </component>
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
  background: #f5f5f5;
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
  color: #777;
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
  color: #888;
  font-variant-numeric: tabular-nums;
}
.record-completed {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #444;
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
  background: #f7f7f7;
}
.own-record:disabled {
  opacity: 0.5;
  cursor: default;
}
.own-record:focus-visible {
  outline: 2px solid #111;
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
