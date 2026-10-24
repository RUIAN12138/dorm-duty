<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogContent, DialogTitle } from "reka-ui";
import { ref, computed } from "vue";
import DormWizard from "./DormWizard.vue";
import {
  configurationOf,
  clone,
  type DormDraft,
} from "../../interaction/dormDraft";
import { choreRequest, type ChoreBoardData } from "../../api/chores";
const props = defineProps<{
  board: ChoreBoardData;
  token: string;
  name: string;
}>();
const emit = defineEmits<{ close: []; saved: []; order: [] }>();
const busy = ref(false),
  error = ref("");
const baseVersion = props.board.version,
  baseCategories = clone(props.board.categories);
const initial = computed<DormDraft>(() => ({
  ...configurationOf(props.board.configuration!),
  name: props.name,
  nickname: props.board.member.nickname,
  baseVersion:props.board.version,
  members: props.board.members
    .filter((m) => m.user_id !== props.board.member.user_id)
    .map((m) => m.nickname),
}));
async function save(draft: DormDraft) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const config = configurationOf(draft);
    const categories = baseCategories.map((c) => {
      const task = config.tasks.find((t) => t.key === c.key);
      return {
        ...c,
        enabled: !!task?.enabled,
        name: task?.name || c.name,
        content: task?.content || c.content,
        deadline_time: task?.deadline || c.deadline_time,
        reminder_interval_days: task?.interval || c.reminder_interval_days,
        mode:
          c.key === "water"
            ? "completion"
            : task?.rotation === "rotation"
              ? "scheduled"
              : "self_round",
      };
    });
    await choreRequest("/chores/settings", props.token, {
      method: "PATCH",
      body: JSON.stringify({
        version: baseVersion,
        categories,
        configuration: config,
      }),
    });
    localStorage.removeItem(`dorm-settings-v2:${props.board.member.user_id}:${props.board.configuration?.pages.map(p=>p.id).join('-')}:${props.name}`);
    emit("saved");
    emit("close");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <DialogRoot :open="true" @update:open="!$event && emit('close')"
    ><DialogPortal
      ><DialogContent as-child :aria-describedby="undefined"
        ><div
          class="workspace-overlay"
          aria-label="任务配置工作台"
          tabindex="-1"
        >
          <DialogTitle class="sr-only">任务配置工作台</DialogTitle
          ><DormWizard
            :initial="initial"
            :draft-key="`dorm-settings-v2:${board.member.user_id}:${board.configuration?.pages.map(p=>p.id).join('-')}:${name}`"
            workspace
            :busy="busy"
            :error="error"
            @submit="save"
            @cancel="emit('close')"
            @order="emit('order')"
          /></div></DialogContent></DialogPortal
  ></DialogRoot>
</template>
<style scoped>
.workspace-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: var(--canvas);
  overflow-y: auto;
  overscroll-behavior: contain;
  animation: workspace-in 280ms var(--ui-ease-out);
}
@keyframes workspace-in {
  from {
    opacity: 0;
    transform: translateX(14px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .workspace-overlay {
    animation: none;
  }
}
</style>
