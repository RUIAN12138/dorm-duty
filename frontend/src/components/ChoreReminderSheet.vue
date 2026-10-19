<script setup lang="ts">
import ElasticSheet from "./ElasticSheet.vue";
import MemberMark from "./MemberMark.vue";
import HintPopover from "./HintPopover.vue";
import { useReminderComposer } from "../composables/useReminderComposer";
import { showToast } from "../interaction/notice";
import type { ChoreMember } from "../api/chores";
const props = defineProps<{
  invite: string;
  token: string;
  memberId: number;
  members: ChoreMember[];
  month: string;
  context?: { memberId: number; taskId: number } | null;
  busy: boolean;
  dateText: (date: string) => string;
}>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ sent: [] }>();
const composer = useReminderComposer(() => ({ ...props, open: open.value }), {
  sent: () => emit("sent"),
  close: () => (open.value = false),
  notify: showToast,
});
</script>
<template>
  <ElasticSheet v-model="open" title="提醒一位室友">
    <template #header-actions
      ><HintPopover
        title="室友提醒"
        text="选择一位室友和一项待办。提醒会显示在对方的网页里，不会替对方完成任务。"
    /></template>
    <div class="reminder-form">
      <p
        v-if="!members.some((person) => person.user_id !== memberId)"
        class="guest-muted"
      >
        宿舍还没有其他室友。
      </p>
      <div class="reminder-people">
        <button
          v-for="person in members.filter(
            (person) => person.user_id !== memberId,
          )"
          :key="person.user_id"
          :class="{ selected: composer.targetId.value === person.user_id }"
          :aria-pressed="composer.targetId.value === person.user_id"
          :disabled="busy || composer.sending.value"
          :data-testid="`reminder-member-${person.user_id}`"
          @click="composer.choose(person.user_id)"
        >
          <MemberMark :id="person.marker_id" :size="22" />{{ person.nickname }}
        </button>
      </div>
      <div v-if="composer.loading.value" class="board-loading" role="status">
        正在查看这位室友的任务…
      </div>
      <div
        v-else-if="composer.targetId.value && composer.loaded.value"
        class="reminder-task-list"
      >
        <p v-if="composer.contextNotice.value" class="guest-muted" role="status">{{ composer.contextNotice.value }}</p>
        <p v-if="!composer.tasks.value.length" class="guest-muted">
          这位室友当前没有待完成任务。
        </p>
        <button
          v-for="task in composer.tasks.value"
          :key="task.id"
          :class="{ selected: composer.taskId.value === task.id }"
          :data-testid="`reminder-task-${task.id}`"
          :aria-pressed="composer.taskId.value === task.id"
          :disabled="busy || composer.sending.value"
          @click="composer.select(task.id)"
        >
          <span>{{ task.name }}</span
          ><small>{{
            task.key === "water"
              ? "轮到抬水"
              : task.mode === "self_round"
                ? "本轮待完成"
                : dateText(task.duty_date)
          }}</small>
        </button>
      </div>
      <p
        v-if="composer.loadError.value"
        class="chore-inline-error"
        role="alert"
      >
        {{ composer.loadError.value }}
        <button
          :disabled="busy || composer.sending.value"
          @click="composer.retry"
        >
          重新读取
        </button>
      </p>
      <p
        v-if="composer.sendError.value"
        class="chore-inline-error"
        role="alert"
      >
        {{ composer.sendError.value }}
        <button
          :disabled="busy || composer.sending.value"
          @click="composer.retry"
        >
          重新查看任务
        </button>
      </p>
      <button
        class="guest-primary"
        data-testid="reminder-submit"
        :disabled="!composer.canSend.value"
        @click="composer.send"
      >
        {{ composer.sending.value ? "发送中…" : "发送提醒" }}
      </button>
    </div></ElasticSheet
  >
</template>
<style scoped>
.reminder-form {
  color: #111;
}
.reminder-people {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 20px 0;
}
.reminder-people button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 10px;
  color: #111;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.reminder-people button.selected,
.reminder-task-list button.selected {
  border-color: #111;
  background: #f7f7f7;
}
.reminder-task-list button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 11px 12px;
  color: #111;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 7px;
  margin-top: 8px;
  font-size: 13px;
}
.reminder-task-list small {
  font-size: 10px;
  color: #777;
}

.chore-inline-error {
  border-left: 2px solid #111;
  padding: 10px 12px;
  color: #555;
  font-size: 15px;
  line-height: 1.6;
  margin-bottom: 12px;
}
.chore-inline-error button {
  display: block;
  min-height: 44px;
  border: 0;
  background: none;
  text-decoration: underline;
  font: inherit;
}
</style>
<style scoped>
.board-loading {
  padding-top: 16px;
  min-height: 160px;
  display: grid;
  place-items: center;
}
@media (prefers-reduced-motion: no-preference) {
  .board-loading {
    animation: reminder-loading-pulse 1.2s ease-in-out infinite alternate;
  }
}
@keyframes reminder-loading-pulse {
  from {
    opacity: 0.45;
  }
  to {
    opacity: 1;
  }
}
</style>
