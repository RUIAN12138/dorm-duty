<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
const selected = ref<number[]>([]);
watch(() => props.state.phase, phase => {
  if (phase !== "recipient") return;
  const target = props.state.target;
  selected.value = target === "all" ? others.value.map(m => m.user_id) : Array.isArray(target) ? [...target] : typeof target === "number" ? [target] : [];
}, { immediate: true });
const allSelected = computed(() => others.value.length > 0 && others.value.every(m => selected.value.includes(m.user_id)));
function toggle(id: number) { selected.value = selected.value.includes(id) ? selected.value.filter(item => item !== id) : [...selected.value, id]; }
function toggleAll() { selected.value = allSelected.value ? [] : others.value.map(m => m.user_id); }
function proceed() { if (selected.value.length) emit("choose", [...selected.value]); }
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
      <div v-if="state.phase === 'recipient'" class="conversation-recipients" role="group" aria-label="留言给谁">
        <div class="recipient-heading"><span>选择室友</span><button v-if="others.length" type="button" class="recipient-all" :aria-pressed="allSelected" @click="toggleAll">{{ allSelected ? '取消全选' : '全选' }}</button></div>
        <div class="recipient-list">
          <button v-for="member in others" :key="member.user_id" type="button" class="recipient-option" :aria-pressed="selected.includes(member.user_id)" @click="toggle(member.user_id)">
            <span>{{ member.nickname }}</span><span class="recipient-check" aria-hidden="true">{{ selected.includes(member.user_id) ? '✓' : '' }}</span>
          </button>
        </div>
        <p v-if="!others.length" class="note-label">室友加入后就能留言。</p>
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
      <button v-if="state.phase === 'recipient'" type="button" class="chat-primary" :disabled="!selected.length" @click="proceed">继续<span v-if="selected.length"> · {{ selected.length }} 人</span></button>
      <button
        v-if="state.target !== null && state.phase !== 'recipient'"
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
.conversation-note-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.conversation-note-actions { margin-top: 14px; }
.conversation-recipients { display:grid; gap:8px; }
.recipient-heading { display:flex; align-items:center; justify-content:space-between; color:var(--ui-muted); font-size:14px; }
.recipient-heading .recipient-all { border:0; background:transparent; min-height:44px; padding:8px 12px; }
.recipient-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; max-height:190px; overflow-y:auto; overscroll-behavior:contain; }
.recipient-option { display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; text-align:left; }
.recipient-option > span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.recipient-option[aria-pressed="true"] { background:var(--ui-ink); color:var(--ui-surface); }
.recipient-check { flex:none; width:16px; text-align:center; }

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
