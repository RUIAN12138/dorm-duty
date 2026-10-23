<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import { motionAllowed } from "../interaction/motion";
import { chatTransition } from "../interaction/chatMotion";
import type { ChoreMember } from "../api/chores";
import type { NoteState, NoteTarget } from "../interaction/conversationNotes";
import { noteTargetName } from "../interaction/conversationNotes";
const props = defineProps<{
  state: NoteState;
  members: ChoreMember[];
  memberId: number;
}>();
const emit = defineEmits<{
  choose: [target: NoteTarget];
  edit: [field: "target" | "text"];
  cancel: [];
  confirm: [];
}>();
const others = computed(() =>
  props.members.filter((m) => m.user_id !== props.memberId),
);
const sending = computed(() => props.state.phase === "sending");
</script>
<template>
  <section
    class="conversation-note"
    data-testid="conversation-note"
    :data-phase="state.phase"
    aria-label="对话留言"
    :aria-busy="sending"
  >
    <!-- The shared dock owns the reversible outer height. This content only
         crossfades when the workflow step changes; it never animates layout. -->
    <motion.div
      :key="
        state.phase === 'sending' || state.phase === 'failed'
          ? 'confirm'
          : state.phase
      "
      :initial="motionAllowed() ? { opacity: 0, y: 5 } : false"
      :animate="{ opacity: 1, y: 0 }"
      :transition="chatTransition('layout')"
    >
      <div
        v-if="state.phase === 'recipient'"
        class="conversation-recipients"
        role="group"
        aria-label="留言给谁"
      >
        <button
          v-if="others.length"
          type="button"
          @click="emit('choose', 'all')"
        >
          所有人
        </button>
        <button
          v-for="member in others"
          :key="member.user_id"
          type="button"
          @click="emit('choose', member.user_id)"
        >
          {{ member.nickname }}
        </button>
      </div>
      <template v-else>
        <span class="note-label">{{
          sending
            ? "正在发送"
            : state.phase === "content"
              ? "留言给"
              : "确认留言"
        }}</span>
        <strong>{{ noteTargetName(state.target, members) }}</strong>
        <p v-if="state.text" class="conversation-note-text">
          {{ state.text }}
        </p>
      </template>
    </motion.div>
    <p v-if="state.error" class="conversation-note-error" role="alert">
      {{ state.error }}
    </p>
    <div class="conversation-note-actions">
      <button
        v-if="state.target !== null"
        type="button"
        :disabled="sending"
        @click="emit('edit', 'target')"
      >
        修改对象
      </button>
      <button
        v-if="['confirm', 'failed', 'sending'].includes(state.phase)"
        type="button"
        :disabled="sending"
        @click="emit('edit', 'text')"
      >
        修改内容
      </button>
      <button type="button" :disabled="sending" @click="emit('cancel')">
        取消
      </button>
      <button
        v-if="['confirm', 'failed', 'sending'].includes(state.phase)"
        type="button"
        class="chat-primary"
        :disabled="sending"
        data-testid="note-confirm"
        @click="emit('confirm')"
      >
        {{
          sending
            ? "正在发送…"
            : state.phase === "failed"
              ? "重新确认"
              : "确认发送"
        }}
      </button>
    </div>
  </section>
</template>
<style scoped>
.conversation-note {
  --note-tint: var(--ui-tint-3);
  position: relative;
  transform-origin: top left;
  padding: 16px;
  border: 1px solid var(--ui-border);
  border-radius: 24px;
  background: color-mix(in srgb, var(--note-tint) 82%, transparent);
  color: var(--ui-chat-body-ink);
}
.conversation-note strong {
  display: block;
  margin: 8px 0 12px;
  font-size: 22px;
  color: var(--ui-chat-title-ink);
  overflow-wrap: anywhere;
  line-break: loose;
  text-wrap: pretty;
}
:global(html[data-theme="dark"]) .conversation-note {
  font-weight: 450;
}
:global(html[data-theme="dark"]) .conversation-note strong {
  font-weight: 610;
}
.note-label {
  font-size: 13px;
  color: var(--ui-muted);
}
.conversation-note-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-break: loose;
  text-wrap: pretty;
  line-height: 1.6;
  margin: 0 0 16px;
}
.conversation-recipients,
.conversation-note-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.conversation-note-actions {
  margin-top: 14px;
}
button {
  border: 1px solid var(--ui-border);
  border-radius: 20px;
  padding: 10px 14px;
  min-height: 44px;
  background: var(--chat-glass);
  color: inherit;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: transform var(--ui-release-time) var(--ui-ease-out);
}
button:not(:disabled):active {
  transform: var(--ui-press-small);
  transition-duration: var(--ui-press-time);
}
.chat-primary {
  background: var(--ui-ink);
  color: var(--ui-surface);
  margin-left: auto;
}
.conversation-note-error {
  font-size: 14px;
  line-height: 1.5;
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
