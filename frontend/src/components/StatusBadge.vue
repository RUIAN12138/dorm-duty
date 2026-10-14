<script setup lang="ts">
defineProps<{ status: string }>();
const names: Record<string, string> = {
  pending: "待完成",
  overdue: "已逾期",
  completed: "已完成",
  completed_late: "逾期完成",
};
</script>
<template>
  <span class="status" :class="status">{{ names[status] || status }}</span>
</template>
