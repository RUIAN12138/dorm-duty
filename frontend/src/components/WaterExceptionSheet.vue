<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  choreRequest,
  type ChoreTask,
  type ChoreCompletion,
} from "../api/chores";
import ElasticSheet from "./ElasticSheet.vue";
import CompletionAction from "./CompletionAction.vue";
const props = defineProps<{
  open: boolean;
  task: ChoreTask;
  memberId: number;
  memberName: string;
  token: string;
  version: number;
  demo: boolean;
  advanceTaskId?: number | null;
}>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
  completed: [receipt: ChoreCompletion];
}>();
const own = computed(() => props.task.assignee_id === props.memberId);
const reason = ref(""),
  busy = ref(false),
  error = ref("");
const receipt = ref<ChoreTask | null>(null);
// The acknowledgement creates a new history row; retain the pressed visual
// identity until the existing CompletionAction state machine has settled.
const actionId = ref(props.task.id);
const animationReceipt = computed(() =>
  receipt.value ? { ...receipt.value, id: actionId.value } : null,
);
const advanceTask = computed<ChoreTask>(
  () =>
    animationReceipt.value || {
      ...props.task,
      id: actionId.value,
      assignee_id: props.memberId,
      assignee_name: props.memberName,
      status: props.advanceTaskId ? "completed" : "pending",
      can_complete: true,
    },
);
watch(
  () => props.open,
  (open) => {
    if (open) {
      reason.value = "";
      error.value = "";
      receipt.value = null;
      actionId.value = props.advanceTaskId || props.task.id;
    }
  },
);
async function submit() {
  if (busy.value || props.demo) {
    if (props.demo) error.value = "游客体验不修改正式安排";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const result = await choreRequest<ChoreCompletion>(
      `/chores/water/${own.value ? "skip" : "advance"}`,
      props.token,
      {
        method: "POST",
        body: JSON.stringify({
          version: props.version,
          task_id: props.task.id,
          reason: reason.value,
        }),
      },
    );
    if (own.value) {
      emit("saved");
      emit("update:open", false);
    } else {
      receipt.value = result.task;
      emit("completed", result);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "操作失败，请重试";
  } finally {
    busy.value = false;
  }
}
async function undo() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await choreRequest(
      `/chores/tasks/${receipt.value?.id || props.advanceTaskId}/undo`,
      props.token,
      { method: "PATCH" },
    );
    receipt.value = null;
    emit("saved");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "撤销失败";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <ElasticSheet
    :model-value="open"
    @update:model-value="emit('update:open', $event)"
    :title="own ? '暂时跳过' : '提前抬水'"
    motion="bottom"
  >
    <div class="water-exception" data-testid="water-exception">
      <template v-if="own">
        <p>这次先让下一位，你会排到队尾。</p>
        <textarea
          v-model="reason"
          maxlength="200"
          rows="2"
          placeholder="原因（选填）"
          aria-label="跳过原因"
          :disabled="busy"
        />
        <button class="exception-submit" :disabled="busy" @click="submit">
          <Transition name="exception-label" mode="out-in"
            ><span :key="String(busy)">{{
              busy ? "正在调整…" : "移到队尾"
            }}</span></Transition
          >
        </button>
      </template>
      <template v-else>
        <p>现在记录，下次轮到你时自动抵扣。</p>
        <CompletionAction
          :task="advanceTask"
          :receipt="animationReceipt"
          :busy="busy"
          :disabled="false"
          :demo="demo"
          @complete="submit"
          @undo="undo"
        />
      </template>
      <Transition name="exception-error"
        ><p v-if="error" role="alert">{{ error }}</p></Transition
      >
    </div>
  </ElasticSheet>
</template>
<style scoped>
.water-exception {
  display: grid;
  gap: 24px;
  padding: 8px 0 20px;
}
.water-exception p {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}
textarea {
  width: 100%;
  resize: none;
  padding: 14px 16px;
  border: 1px solid var(--ui-border);
  border-radius: 16px;
  background: var(--ui-surface);
  color: var(--ui-ink);
  font: inherit;
}
.exception-submit {
  border: 0;
  border-radius: 24px;
  min-height: 50px;
  background: var(--ui-ink);
  color: var(--ui-surface);
  font: inherit;
  transition: transform var(--ui-release-time) var(--ui-ease-out);
}
.exception-label-enter-active,
.exception-label-leave-active {
  transition:
    opacity 140ms,
    transform 140ms var(--ui-ease-out);
}
.exception-label-enter-from {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}
.exception-label-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
.exception-submit span {
  display: inline-block;
}
.exception-submit:active:not(:disabled) {
  transform: scale(0.96);
}
.exception-error-enter-active,
.exception-error-leave-active {
  transition:
    opacity 180ms,
    transform 180ms var(--ui-ease-out);
}
.exception-error-enter-from,
.exception-error-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
