<script setup lang="ts">
import { computed, ref } from "vue";
import type { ChoreBoardData, ChoreCategory, ChoreMember, ChoreRecord, ChoreTask } from "../../api/chores";
import type { DormDraft } from "../../interaction/dormDraft";
import { reorderPage } from "../../interaction/dormDraft";
import ScreenStage from "../ScreenStage.vue";
import ChoreBoard from "../ChoreBoard.vue";
import ChoreBottomNav from "../ChoreBottomNav.vue";

const props = defineProps<{ draft: DormDraft; open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const section = ref<"duty" | "water" | "calendar">(props.draft.pages[0]?.id || "duty");
function localDate(input: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(input);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}
const today = localDate(new Date());
const memberIds = [-1, -2, -3];
const members: ChoreMember[] = [
  { user_id: -1, nickname: props.draft.nickname || "你", marker_id: "default" },
  { user_id: -2, nickname: "室友二", marker_id: "default" },
  { user_id: -3, nickname: "室友三", marker_id: "default" },
];
const localTasks = computed<ChoreTask[]>(() => {
  let id = -1;
  return props.draft.tasks.filter((task) => task.enabled).flatMap((task) => {
    const mode: ChoreCategory["mode"] = task.key === "water"
      ? "completion"
      : task.rotation === "rotation" ? "scheduled" : task.rotation === "completion" ? "completion" : "self_round";
    const assignees = mode === "completion" ? memberIds.slice(0, 1) : memberIds;
    return assignees.map((memberId, index) => {
      const person = members.find((candidate) => candidate.user_id === memberId)!;
      const taskId = id--;
      return {
        id: taskId,
        key: task.key,
        name: task.name,
        content: task.content,
        duty_date: today,
        assignee_id: memberId,
        assignee_name: person.nickname,
        marker_id: person.marker_id,
        deadline_at: `${today}T${task.deadline}:00+08:00`,
        status: "pending",
        completed_at: null,
        can_complete: true,
        sequence: mode === "scheduled" ? undefined : 1,
        mode,
      } satisfies ChoreTask;
    });
  });
});
const localRecords = computed<ChoreRecord[]>(() => {
  const anchor = new Date(`${today}T12:00:00+08:00`);
  return props.draft.tasks.filter((task) => task.enabled).flatMap((task, index) => {
    const date = new Date(anchor);
    date.setDate(date.getDate() - index - 1);
    const completedDate = localDate(date);
    const member = members[(index % 2) + 1]!;
    return [{
      id: -100 - index,
      key: task.key,
      name: task.name,
      assignee_id: member.user_id,
      assignee_name: member.nickname,
      marker_id: member.marker_id,
      completed_at: date.toISOString(),
      completed_date: completedDate,
    }];
  });
});
const previewData = computed<ChoreBoardData>(() => {
  const categories: ChoreCategory[] = props.draft.tasks.map((task) => ({
    key: task.key,
    name: task.name,
    content: task.content,
    deadline_time: task.deadline,
    start_date: today,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    rotation_days: 1,
    reminder_interval_days: task.interval,
    rotation_order: [...memberIds],
    enabled: task.enabled,
    mode: task.key === "water" ? "completion" : task.rotation === "rotation" ? "scheduled" : task.rotation === "completion" ? "completion" : "self_round",
  }));
  const rounds = categories.filter((category) => category.enabled && category.mode === "self_round").map((category) => ({
    key: category.key as "floor" | "toilet" | "sink",
    sequence: 1,
    completed: 1,
    total: members.length,
    members: members.map((member, index) => ({ ...member, completed: index === 1 })),
    completions: [{ ...members[1]!, id: -200, completed_at: localRecords.value[0]?.completed_at || new Date().toISOString() }],
  }));
  const configuration = {
    schema_version: 2 as const,
    pages: props.draft.pages.map((page) => ({ ...page })),
    tasks: props.draft.tasks.map((task) => ({ ...task })),
    policy: props.draft.policy,
    second_page_kind: props.draft.second_page_kind,
  };
  const water = localTasks.value.find((task) => task.key === "water" && task.assignee_id === -1) || null;
  return {
    configuration,
    workspace_tasks: localTasks.value,
    today,
    server_time: new Date().toISOString(),
    version: 1,
    is_creator: true,
    member: members[0]!,
    members,
    categories,
    rounds,
    // The production duty surface expects today's personal assignments, while
    // the water-order sheet still receives the complete member roster above.
    today_tasks: localTasks.value.filter((task) => task.assignee_id === -1),
    next_tasks: localTasks.value.filter((task) => task.assignee_id === -1),
    water_task: water,
    water_order: [...memberIds],
    undo_tasks: [],
    calendar: localRecords.value,
    reminders: [],
  };
});
function selectPage(value: "duty" | "water" | "calendar") { section.value = value; }
function reorderPageItem(id: "duty" | "water" | "calendar", toIndex: number) {
  const from = props.draft.pages.findIndex((page) => page.id === id);
  if (from >= 0) reorderPage(props.draft, from, toIndex);
}
</script>

<template>
  <Teleport to="body">
    <div
      class="live-preview"
      :class="{ 'is-open': open }"
      :aria-hidden="!open"
      :inert="!open"
      data-testid="live-draft-preview"
    >
      <ScreenStage signed-in>
        <ChoreBoard
          :invite="`draft-${draft.name || 'new-room'}`"
          :dorm-name="draft.name || '新宿舍'"
          :member-id="-1"
          token=""
          :demo="false"
          preview
          :preview-data="previewData"
          :pages="draft.pages"
          :section="section"
          @section-change="selectPage"
          @page-reorder="reorderPageItem"
          @exit-preview="emit('close')"
        />
        <ChoreBottomNav
          preview
          :section="section"
          :pages="draft.pages"
          @select="selectPage"
          @reorder="reorderPageItem"
        />
      </ScreenStage>
    </div>
  </Teleport>
</template>

<style scoped>
.live-preview { position: fixed; inset: 0; z-index: 210; background: var(--canvas); opacity: 0; transform: scale(.995); pointer-events: none; transition: opacity 180ms cubic-bezier(.22,1,.36,1), transform 220ms cubic-bezier(.22,1,.36,1); }
.live-preview.is-open { opacity: 1; transform: none; pointer-events: auto; }
@media (prefers-reduced-motion: reduce) { .live-preview { transition: none; } }
</style>
