<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { showConfirmDialog } from "vant";
import {
  choreRequest,
  type ChoreRecord,
  type ChoreMember,
} from "../api/chores";
import ElasticSheet from "./ElasticSheet.vue";
const props = defineProps<{
  modelValue: boolean;
  record: ChoreRecord | null;
  date: string;
  today: string;
  version: number;
  token: string;
  memberId: number;
  members: ChoreMember[];
  creator: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [];
}>();
const when = ref(""),
  key = ref("floor"),
  member = ref(props.memberId),
  reason = ref(""),
  busy = ref(false),
  error = ref(""),
  revision = ref(0);
const audit = ref<
  {
    actor_name: string;
    reason: string;
    created_at: string;
    before: { completed_at: string; voided: boolean } | null;
    after: { completed_at: string; voided: boolean };
  }[]
>([]);
let controller: AbortController | undefined;
const localTime = (s: string) =>
  new Date(new Date(s).getTime() + 8 * 3600000).toISOString().slice(0, 16);
const display = (s: string) => localTime(s).replace("T", " ");
watch(
  () => props.modelValue,
  async (open) => {
    controller?.abort();
    busy.value = false;
    if (!open) return;
    when.value = props.record
      ? localTime(props.record.completed_at)
      : `${props.date || props.today}T12:00`;
    key.value = props.record?.key || "floor";
    member.value = props.record?.assignee_id || props.memberId;
    reason.value = "";
    error.value = "";
    audit.value = [];
    revision.value = props.record?.revision || 0;
    if (props.record) {
      controller = new AbortController();
      const current = controller;
      busy.value = true;
      try {
        const data = await choreRequest<{
          record: ChoreRecord;
          audit: typeof audit.value;
        }>(`/chores/history?id=${props.record.id}`, props.token, {
          signal: controller.signal,
        });
        if (current !== controller || current.signal.aborted) return;
        revision.value = data.record.revision || 0;
        when.value = localTime(data.record.completed_at);
        audit.value = data.audit;
      } catch (e) {
        if (current === controller && (e as Error).name !== "AbortError")
          error.value = (e as Error).message;
      } finally {
        if (current === controller) busy.value = false;
      }
    }
  },
);
onBeforeUnmount(() => controller?.abort());
async function save(remove = false) {
  if (busy.value) return;
  if (!reason.value.trim()) {
    error.value = "请填写补记或修正原因";
    return;
  }
  if (remove) {
    try {
      await showConfirmDialog({
        title: "删除这条历史记录？",
        message: "仅从日历和统计移除，原记录与修正日志保留。当前轮次不变。",
        confirmButtonText: "删除记录",
        cancelButtonText: "保留记录",
      });
    } catch {
      return;
    }
  }
  busy.value = true;
  error.value = "";
  try {
    await choreRequest("/chores/history", props.token, {
      method: remove ? "DELETE" : props.record ? "PATCH" : "POST",
      body: JSON.stringify({
        version: props.version,
        reason: reason.value.trim(),
        ...(props.record
          ? { id: props.record.id, revision: revision.value }
          : { member_id: member.value, key: key.value }),
        ...(!remove ? { completed_at: `${when.value}:00+08:00` } : {}),
      }),
    });
    emit("saved");
    emit("update:modelValue", false);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <ElasticSheet
    :model-value="modelValue"
    :title="record ? '修正记录' : '补记完成'"
    motion="bottom"
    contained
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="history-editor" @submit.prevent="save()">
      <label v-if="creator && !record"
        >成员<select v-model="member" aria-label="成员">
          <option
            v-for="person in members"
            :key="person.user_id"
            :value="person.user_id"
          >
            {{ person.nickname }}
          </option>
        </select></label
      >
      <label v-if="!record"
        >任务<select v-model="key" aria-label="任务">
          <option value="floor">地板</option>
          <option value="toilet">厕所</option>
          <option value="sink">洗手池</option>
          <option value="water">抬水</option>
        </select></label
      >
      <p v-else class="history-record-title">
        {{ record.assignee_name }} · {{ record.name }}
      </p>
      <label
        >完成时间<input
          v-model="when"
          type="datetime-local"
          required
          min="2020-01-01T00:00"
          :max="`${today}T23:59`"
          :disabled="busy"
      /></label>
      <label
        >原因<input
          v-model="reason"
          maxlength="200"
          required
          placeholder="例如：昨天忘记打卡"
          :disabled="busy"
      /></label>
      <p v-if="error" role="alert">{{ error }}</p>
      <details v-if="audit.length">
        <summary>修正记录 · {{ audit.length }}</summary>
        <article v-for="(entry, i) in audit" :key="i">
          <strong>{{ entry.actor_name }}</strong
          ><time>{{ display(entry.created_at) }}</time>
          <p>
            {{ entry.before ? display(entry.before.completed_at) : "补记" }} →
            {{
              entry.after.voided ? "已移除" : display(entry.after.completed_at)
            }}
          </p>
          <p>{{ entry.reason }}</p>
        </article>
      </details>
      <button
        v-if="record"
        type="button"
        class="history-delete"
        :disabled="busy"
        @click="save(true)"
      >
        删除历史记录
      </button>
    </form>
    <template #footer
      ><button
        class="history-save"
        :disabled="busy || !reason.trim() || !when"
        @click="save()"
      >
        {{ busy ? "正在保存…" : record ? "保存修正" : "保存补记" }}
      </button></template
    >
  </ElasticSheet>
</template>
<style scoped>
.history-editor {
  display: grid;
  gap: var(--ui-space-md);
  font-size: var(--ui-body-size);
  line-height: var(--ui-body-leading);
}
label {
  display: grid;
  gap: var(--ui-card-gap);
}
input,
select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: var(--ui-action-height);
  padding: var(--ui-card-padding);
  border: var(--ui-card-border);
  border-radius: var(--ui-control-radius);
  background: var(--ui-surface);
  font: inherit;
  color: var(--ui-ink);
}
.history-record-title {
  font-size: var(--ui-card-title-size);
  font-weight: 600;
}
.history-save {
  width: 100%;
  min-height: var(--ui-action-height);
  border: 0;
  border-radius: var(--ui-control-radius);
  background: var(--ui-ink);
  color: var(--ui-surface);
  font: inherit;
  font-weight: 600;
}
.history-delete {
  min-height: 44px;
  border: 0;
  background: none;
  font: inherit;
  text-decoration: underline;
  color: var(--ui-text-muted);
}
summary,
time,
article p {
  font-size: var(--ui-small-size);
  color: var(--ui-text-muted);
}
article {
  margin-top: var(--ui-space-sm);
  padding: var(--ui-card-padding);
  border: var(--ui-card-border);
  border-radius: var(--ui-card-radius);
}
time {
  display: block;
  margin: var(--ui-card-gap) 0;
}
p {
  margin: 0;
}
</style>
