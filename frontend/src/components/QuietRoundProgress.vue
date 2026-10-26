<script setup lang="ts">
import "../interaction/memberNames.css";
import type { ChoreBoardData } from "../api/chores";
defineProps<{ round: ChoreBoardData["rounds"][number]; compact?: boolean }>();
</script>
<template>
  <span v-if="compact" class="quiet-round-count"
    >{{ round.completed }}/{{ round.total }} · 第 {{ round.sequence }} 轮</span
  >
  <section v-else class="quiet-round" aria-label="本轮完成进度">
    <p class="round-count">
      <strong class="rounded-member-name"
        >{{ round.completed }}<span>/{{ round.total }}</span></strong
      ><span>第 {{ round.sequence }} 轮</span>
    </p>
    <progress
      :value="round.completed"
      :max="Math.max(1, round.total)"
      :aria-label="`已完成${round.completed}人，共${round.total}人`"
    />
    <ul>
      <li v-for="person in round.members" :key="person.user_id">
        <span>{{ person.nickname }}</span
        ><span class="member-state">{{
          person.completed ? "已完成" : "待完成"
        }}</span>
      </li>
    </ul>
  </section>
</template>
<style scoped>
.quiet-round-count {
  font-size: var(--ui-small-size);
  font-variant-numeric: tabular-nums;
}
.quiet-round {
  display: grid;
  gap: var(--ui-space-sm);
}
.round-count {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  gap: var(--ui-space-sm);
  font-size: var(--ui-small-size);
  color: var(--ui-text-muted);
}
strong {
  font-size: var(--ui-title-size);
  line-height: var(--ui-title-leading);
  color: var(--ui-ink);
  font-variant-numeric: tabular-nums;
}
strong span {
  font-size: var(--ui-card-title-size);
  color: var(--ui-text-muted);
}
progress {
  width: 100%;
  height: 6px;
  border: 0;
  border-radius: var(--ui-control-radius);
  overflow: hidden;
  accent-color: var(--ui-ink);
}
progress::-webkit-progress-bar {
  background: var(--ui-surface-muted);
}
progress::-webkit-progress-value {
  background: var(--ui-ink);
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--ui-card-gap);
}
li {
  display: flex;
  align-items: center;
  gap: var(--ui-card-gap);
  padding: var(--ui-card-padding);
  border: var(--ui-card-border);
  border-radius: var(--ui-card-radius);
  font-size: var(--ui-body-size);
}
.member-state {
  margin-left: auto;
  font-size: var(--ui-small-size);
  color: var(--ui-text-muted);
}
</style>
