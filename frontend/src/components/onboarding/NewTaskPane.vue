<script setup lang="ts">
import { computed, ref } from "vue";
import type { ChoreBoardData, ChoreTask } from "../../api/chores";
import WaterNudge from "../WaterNudge.vue";
import WaterHandoffName from "../WaterHandoffName.vue";
import CompletionAction from "../CompletionAction.vue";
const props = defineProps<{
  board: ChoreBoardData;
  scope: string;
  section: "duty" | "water";
  busy: boolean;
  receipt?: ChoreTask | null;
  nudgeStatus?: string;
  demo?: boolean;
}>();
const emit = defineEmits<{
  complete: [ChoreTask];
  undo: [ChoreTask];
  details: [ChoreTask, MouseEvent];
  round: [ChoreTask];
  nudge:[ChoreTask];
}>();
const selected = ref<Record<string, number>>({});
const groups = computed(() =>
  props.board
    .configuration!.tasks.filter((t) => t.enabled && t.page === props.section)
    .map((config) => {
      const list = (props.board.workspace_tasks || []).filter(
        (t) => t.key === config.key,
      );
      const task =
        list.find((t) => t.id === selected.value[config.key]) ||
        list.find((t) => t.assignee_id === props.board.member.user_id) ||
        list[0];
      return { config, list, task };
    }),
);
</script>
<template>
  <section class="new-task-pane" :data-testid="`pane-${section}`">
    <p class="new-task-policy">
      {{
        board.configuration?.policy === "hard"
          ? "按时完成，也可以互相帮忙"
          : "按你们的节奏，照顾宿舍"
      }}
    </p>
    <article
      v-for="group in groups"
      :key="group.config.key"
      :class="{ large: group.config.display === 'title' }"
    >
      <template v-if="group.task"
        ><button
          class="new-task-title"
          @click="emit('details', group.task, $event)"
        >
          {{ group.config.name }}</button
        ><WaterHandoffName
          v-if="group.task.key === 'water'"
          :scope="scope"
          :event="board.water_handoff"
          :members="board.members"
          :target-id="group.task.assignee_id"
          :target-name="group.task.assignee_name"
          ><strong class="rounded-member-name">{{
            group.task.assignee_name
          }}</strong></WaterHandoffName
        >
        <p v-else class="new-task-owner">
          <span>{{
            group.task.status === "completed" ? "本次已完成" : "轮到"
          }}</span
          ><strong class="rounded-member-name">{{
            group.task.status === "completed"
              ? group.task.assignee_name
              : board.members.find((m) => m.user_id === group.task!.assignee_id)
                  ?.nickname
          }}</strong>
        </p>
        <select
          v-if="group.list.length > 1"
          v-model.number="selected[group.config.key]"
          :aria-label="`选择${group.config.name}任务或代做对象`"
        >
          <option v-for="task in group.list" :key="task.id" :value="task.id">
            {{
              board.members.find((m) => m.user_id === task.assignee_id)
                ?.nickname
            }}
            · {{ task.status === "completed" ? "已完成" : "待完成" }}
          </option></select
        ><template v-if="section==='water'&&board.configuration?.second_page_kind==='nudge'&&group.task.assignee_id!==board.member.user_id"><WaterNudge :name="group.task.assignee_name" @tap="emit('nudge',group.task)"/><p role="status" class="new-task-deadline">{{nudgeStatus||'点一下，轻轻提醒'}}</p></template><CompletionAction v-else
          :task="group.task"
          :receipt="receipt"
          :busy="busy"
          :disabled="
            busy || (group.task.status==='pending'&&!group.task.can_complete) ||
            (group.task.status === 'completed' &&
              (group.task.completed_by || group.task.assignee_id) !==
                board.member.user_id)
          "
          :demo="demo || false"
          @complete="emit('complete', $event)"
          @undo="emit('undo', $event)"
        /><button
          v-if="board.rounds.some((r) => r.key === group.config.key)"
          class="new-task-round"
          @click="emit('round', group.task)"
        >
          查看本轮完成情况 ›
        </button>
        <p v-if="group.task.deadline_at" class="new-task-deadline">
          {{ group.config.deadline }} 前完成
        </p></template
      ><template v-else
        ><h2>{{ group.config.name }}</h2>
        <p>下一次安排尚未开始</p></template
      >
    </article>
    <p v-if="!groups.length" class="new-task-empty">
      此页暂无任务，可在配置工作台添加。
    </p>
  </section>
</template>
<style scoped>
.new-task-pane {
  padding: 32px 8px 120px;
  display: grid;
  gap: 32px;
}
.new-task-policy {
  color: var(--muted);
  text-align: center;
  font-size: 14px;
}
.new-task-pane article {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 16px;
  padding: 24px 0;
  border-bottom: 1px solid var(--line);
}
.new-task-title {
  font-size: 28px;
  font-weight: 700;
  border: 0;
  background: none;
  color: var(--ink);
  padding: 8px;
}
.large .new-task-title {
  font-size: clamp(40px, 10vw, 64px);
}
.new-task-owner {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 0;
}
.new-task-owner > span {
  color: var(--muted);
  font-size: 14px;
}
.new-task-owner strong {
  font-size: 20px;
}
.new-task-pane select {
  max-width: 100%;
  padding: 10px 18px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--canvas);
  color: var(--ink);
  font: inherit;
}
.new-task-round {
  background: none;
  border: 0;
  color: var(--muted);
  padding: 10px;
  font: inherit;
  font-size: 14px;
}
.new-task-deadline,
.new-task-empty {
  font-size: 14px;
  color: var(--muted);
}
.new-task-pane button {
  transition: transform 0.22s var(--ui-ease-out);
}
.new-task-pane button:active {
  transform: scale(0.97);
}
</style>
