<script setup lang="ts">
import type { Duty } from "../api/types";
import StatusBadge from "./StatusBadge.vue";
withDefaults(defineProps<{ task: Duty; interactive?: boolean }>(), {
  interactive: false,
});
const emit = defineEmits<{ select: [task: Duty, origin: DOMRect] }>();
const week = (day: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(day + "T12:00:00+08:00"));
function select(e: Event, task: Duty) {
  emit(
    "select",
    task,
    (e.currentTarget as HTMLElement).getBoundingClientRect(),
  );
}
</script>
<template>
  <component
    :is="interactive ? 'button' : 'div'"
    class="duty-row"
    :class="{ interactive }"
    :type="interactive ? 'button' : undefined"
    :aria-label="
      interactive
        ? `${task.duty_date} ${task.assignee_name_snapshot} 查看详情`
        : undefined
    "
    @click="interactive && select($event, task)"
  >
    <div class="day-block">
      <strong>{{ task.duty_date.slice(8) }}</strong
      ><span>{{ week(task.duty_date) }}</span>
    </div>
    <div class="row-main">
      <strong>{{ task.assignee_name_snapshot }}</strong
      ><span>{{ task.task_text }}</span>
    </div>
    <StatusBadge :status="task.display_status" /><van-icon
      v-if="interactive"
      name="arrow"
      class="row-arrow"
    />
  </component>
</template>
