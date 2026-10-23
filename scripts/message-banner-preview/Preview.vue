<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import ReminderBanner from "../../frontend/src/components/ReminderBanner.vue";
import { useBannerQuickReply } from "../../frontend/src/composables/useBannerQuickReply";
import { useReminderInbox } from "../../frontend/src/composables/useReminderInbox";
import type { ChoreReminder } from "../../frontend/src/api/chores";
const key = "message-banner-test-only-v1";
const members = [
  { user_id: 1, nickname: "小林", marker_id: "pixel-01" },
  { user_id: 2, nickname: "小陈", marker_id: "pixel-02" },
];
const notes = ref<ChoreReminder[]>([]),
  active = ref<ChoreReminder | null>(null),
  feedback = ref(""),
  busy = ref("");
const failSend = ref(false),
  failRead = ref(false),
  readAttempts = ref(0);
const pending = ref(0);
const inspected = ref("点击查询，读取本机模拟服务器状态");
const nativeFetch = window.fetch.bind(window);
// This adapter exists only in the separate test entry. No production request is forwarded.
function persist() {
  localStorage.setItem(key, JSON.stringify(notes.value));
}
function snapshot() {
  return JSON.parse(localStorage.getItem(key) || "[]");
}
window.fetch = async (input, options = {}) => {
  const request =
    input instanceof Request
      ? input
      : new Request(new URL(String(input), location.href), options);
  const url = new URL(request.url);
  if (url.origin !== location.origin)
    return Response.json(
      { detail: { message: "测试版本不连接外部服务" } },
      { status: 503 },
    );
  if (url.pathname === "/chores/notes") {
    if (failSend.value)
      return Response.json(
        { detail: { message: "模拟发送失败，草稿会保留" } },
        { status: 503 },
      );
    const data = await request.json();
    if (data.target_member_id !== 2)
      return Response.json(
        { detail: { message: "模拟收件人无效" } },
        { status: 422 },
      );
    feedback.value = `已回复小陈：${data.text}`;
    return Response.json({ id: Date.now() }, { status: 201 });
  }
  const read = url.pathname.match(/^\/chores\/reminders\/(\d+)\/read$/);
  if (read) {
    readAttempts.value++;
    if (failRead.value)
      return Response.json(
        { detail: { message: "模拟已读同步失败" } },
        { status: 503 },
      );
    const row = notes.value.find((n) => n.id === Number(read[1]));
    if (!row)
      return Response.json(
        { detail: { message: "消息不存在" } },
        { status: 404 },
      );
    row.read_at ||= new Date().toISOString();
    persist();
    return Response.json({ read_at: row.read_at });
  }
  if (
    /^\/(chores|auth|email|guest|dorms|duties|push|notifications|health)(\/|$)/.test(
      url.pathname,
    )
  )
    return Response.json(
      { detail: { message: "隔离测试不提供正式业务接口" } },
      { status: 503 },
    );
  return nativeFetch(input, options);
};
const inbox = useReminderInbox(
  () => ({
    open: false,
    token: "preview-token-not-valid",
    invite: "preview-only",
    memberId: 1,
  }),
  busy,
  { confirmed: () => persist() },
);
const reply = useBannerQuickReply(
  () => ({
    token: "preview-token-not-valid",
    invite: "preview-only",
    memberId: 1,
    members,
  }),
  {
    notice: (message) => (feedback.value = message),
    sent: (id) => {
      active.value = null;
      void acknowledge(id);
    },
  },
);
function incoming() {
  const n = {
    id: Date.now(),
    sender_id: 2,
    sender_name: "小陈",
    source: "note",
    task_name: "室友留言",
    body: "晚上回来记得带桶水，谢谢！",
    created_at: new Date().toISOString(),
    read_at: null,
  } as ChoreReminder;
  notes.value.push(n);
  persist();
  active.value = n;
  feedback.value = "";
}
function dismiss(id: number, reason: string) {
  if (active.value?.id !== id || reply.sending.value) return;
  reply.cancel(id);
  active.value = null;
  if (["close", "swipe"].includes(reason)) void acknowledge(id);
}
function cancel(id: number) {
  reply.cancel(id);
}
function inspect() {
  inspected.value = JSON.stringify(
    snapshot().map((n: ChoreReminder) => ({ id: n.id, read_at: n.read_at })),
    null,
    2,
  );
}
async function acknowledge(id: number) {
  await inbox.read(id, true);
  pending.value = inbox.pendingIds().length;
}
async function retry() {
  failRead.value = false;
  await new Promise((r) => setTimeout(r, 3100));
  await inbox.retryPending();
  pending.value = inbox.pendingIds().length;
  inspect();
}
function theme() {
  document.documentElement.dataset.theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.style.colorScheme =
    document.documentElement.dataset.theme;
}
onBeforeUnmount(() => (window.fetch = nativeFetch));
try {
  notes.value = snapshot();
} catch {}
incoming();
</script>
<template>
  <main class="preview-page">
    <header>
      <span>轮到</span><small>独立测试版本 · 合成数据</small
      ><button @click="theme">明 / 暗</button>
    </header>
    <section class="sample-task" aria-hidden="true">
      <p>测试宿舍</p>
      <h1>地板</h1>
      <div class="sample-action">我已完成</div>
      <p>○　0/2 · 第 1 轮</p>
    </section>
    <section class="test-tools" aria-label="消息浮窗测试工具">
      <h2>消息浮窗验收</h2>
      <p>长按顶部消息约 400ms，直接回复。</p>
      <div class="tools-row">
        <button @click="incoming" :disabled="reply.editing.value">新消息</button
        ><button @click="inspect">查询模拟后台</button
        ><button
          @click="active = notes.find((n) => !n.read_at) || null"
          :disabled="reply.editing.value"
        >
          重看未读
        </button>
      </div>
      <div class="tools-row">
        <label><input type="checkbox" v-model="failSend" />发送失败</label
        ><label><input type="checkbox" v-model="failRead" />已读同步失败</label>
      </div>
      <div class="tools-row">
        <button @click="retry">恢复同步并重试</button
        ><span>读请求 {{ readAttempts }} 次 · 待同步 {{ pending }}</span>
      </div>
      <p role="status">
        {{
          feedback || inbox.error.value || "取消回复和自动消失不会标记已读。"
        }}
      </p>
      <pre data-testid="preview-backend">{{ inspected }}</pre>
    </section>
    <ReminderBanner
      :note="active"
      :reply-state="reply.phase.value"
      :reply-draft="reply.draft.value"
      :reply-error="reply.error.value"
      :reply-sender="reply.senderName.value"
      @reply="reply.open(active)"
      @update:reply-draft="reply.setDraft"
      @send="reply.send"
      @cancel="cancel"
      @dismiss="dismiss"
      @expire="
        (id) => {
          if (active?.id === id) active = null;
        }
      "
    />
  </main>
</template>
<style scoped>
.preview-page {
  min-height: 100dvh;
  background: var(--ui-surface, #fff);
  color: var(--app-tone-h111, #111);
  padding: calc(env(safe-area-inset-top) + 90px) 20px 24px;
  box-sizing: border-box;
  max-width: 520px;
  margin: auto;
}
header {
  display: flex;
  align-items: center;
  gap: 12px;
}
header > span {
  font-weight: 700;
  font-size: 22px;
}
small {
  font-size: 12px;
  color: var(--app-tone-h777, #777);
}
header button {
  margin-left: auto;
}
.sample-task {
  padding: 30px 0;
  text-align: center;
}
.sample-task h1 {
  font-size: 64px;
  margin: 16px;
}
.sample-action {
  border-radius: 30px;
  background: var(--app-tone-h111, #111);
  color: var(--app-tone-hfff, #fff);
  padding: 14px;
  margin: 20px;
}
.sample-task p {
  color: var(--app-tone-h777, #777);
}
.test-tools {
  border: 1px solid var(--glass-border, #ddd);
  border-radius: 24px;
  padding: 16px;
}
.test-tools h2 {
  font-size: 20px;
  margin: 0;
}
.test-tools p {
  font-size: 14px;
  line-height: 1.5;
}
.tools-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
}
.tools-row span {
  font-size: 12px;
}
button {
  border: 1px solid var(--glass-border, #ddd);
  background: var(--app-tone-hf6f6f6, #f6f6f6);
  color: inherit;
  border-radius: 22px;
  padding: 10px 12px;
  min-height: 44px;
  font: inherit;
  font-size: 13px;
}
label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  min-height: 44px;
}
pre {
  font-size: 11px;
  white-space: pre-wrap;
  max-height: 150px;
  overflow: auto;
}
button:disabled {
  opacity: 0.45;
}
</style>
