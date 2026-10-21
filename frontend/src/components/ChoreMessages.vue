<script setup lang="ts">
import ElasticSheet from "./ElasticSheet.vue";
import type { ChoreReminder } from "../api/chores";
defineProps<{
  reminders: ChoreReminder[];
  unreadCount: number;
  busy: boolean;
  error?: string;
  pendingId?: number;
  formatTime: (value: string) => string;
}>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ read: [id: number]; closed: [] }>();
</script>
<template>
  <ElasticSheet v-model="open" title="室友消息" @closed="emit('closed')">
    <div class="chore-reminders" data-testid="chore-reminders">
      <div class="messages-heading">
        <p>
          {{ unreadCount ? `还有 ${unreadCount} 条未读提醒` : "全部已读" }}
        </p>
        <button data-testid="messages-close" @click="open = false">
          收起消息
        </button>
      </div>
      <p v-if="error" class="message-error" role="alert">{{ error }}</p>
      <p v-if="!reminders.length" class="messages-empty">还没有室友提醒。</p>
      <article
        v-for="note in reminders"
        :key="note.id"
        :data-testid="`reminder-${note.id}`"
      >
        <p class="reminder-sender">
          {{
            note.source === "note"
              ? "给你留言"
              : `${note.task_name || "宿舍任务"}提醒`
          }}
        </p>
        <h3 class="reminder-task-name">
          {{ note.sender_name || "室友" }}
        </h3>
        <p
          class="reminder-content"
          v-if="note.body && note.body !== note.task_name"
        >
          {{ note.body }}
        </p>
        <div>
          <time :datetime="note.created_at">{{
            formatTime(note.created_at)
          }}</time
          ><button
            v-if="!note.read_at"
            :disabled="busy"
            :aria-busy="pendingId === note.id"
            :data-testid="`reminder-read-${note.id}`"
            @click="emit('read', note.id)"
          >
            {{ pendingId === note.id ? "记录中…" : "知道了" }}</button
          ><span v-else class="message-read">已读</span>
        </div>
      </article>
    </div>
  </ElasticSheet>
</template>
<style scoped>
.message-error {
  padding: 10px 0;
  color: var(--app-tone-h555, #555);
  font-size: 14px;
  line-height: 1.6;
}

.messages-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.messages-heading p,
.messages-empty {
  font-size: 16px;
  color: var(--app-tone-h555, #555);
  line-height: 1.6;
}
.messages-heading button {
  border: 0;
  background: none;
  color: var(--app-tone-h555, #555);
  min-height: 44px;
  font-size: 15px;
  padding: 8px 0;
}
.message-read {
  font-size: 14px;
  color: var(--app-tone-h666, #666);
  padding: 12px 0;
}
.chore-reminders {
  border-top: 1px solid var(--app-tone-h111, #111);
  margin-top: 0;
  padding-top: 16px;
}
.chore-reminders header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.chore-reminders h2 {
  font-size: 14px;
  font-weight: 550;
  margin: 0;
}
.chore-reminders header span {
  font-size: 10px;
  color: var(--app-tone-h777, #777);
}
.chore-reminders article {
  border-bottom: 1px solid var(--app-tone-heee, #eee);
  padding: 12px 0;
}
.chore-reminders article p {
  margin: 0;
  font-size: 16px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.chore-reminders .reminder-sender {
  color: var(--app-tone-h555, #555);
}
.chore-reminders .reminder-task-name {
  font-size: 32px;
  letter-spacing: -0.8px;
  line-height: 1.25;
  margin: 8px 0 12px;
  overflow-wrap: anywhere;
}
.chore-reminders .reminder-content {
  margin-bottom: 12px;
}
.chore-reminders article div {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.chore-reminders time {
  font-size: 10px;
  color: var(--app-tone-h777, #777);
}
.chore-reminders article button {
  background: none;
  border: 0;
  min-height: 40px;
  color: var(--app-tone-h555, #555);
  font-size: 11px;
  padding: 7px 0;
}
</style>
