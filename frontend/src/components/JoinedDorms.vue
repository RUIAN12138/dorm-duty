<script setup lang="ts">
import type { JoinedDorm } from "../api/dormHistory";
import MemberMark from "./MemberMark.vue";
defineProps<{ rooms: JoinedDorm[]; disabled?: boolean; current?: string }>();
defineEmits<{ select: [room: JoinedDorm] }>();
</script>
<template>
  <section v-if="rooms.length" class="joined-dorms" aria-label="已加入的宿舍">
    <h2>我的宿舍</h2>
    <button
      v-for="room in rooms"
      :key="room.code"
      :data-testid="`saved-dorm-${room.code}`"
      :disabled="disabled"
      @click="$emit('select', room)"
    >
      <MemberMark inline :id="room.marker" :size="30" />
      <span
        ><strong>{{ room.name }}</strong
        ><span
          >{{ room.nickname
          }}<template v-if="room.code === current"> · 当前宿舍</template></span
        ></span
      >
      <van-icon name="arrow" aria-hidden="true" />
    </button>
  </section>
</template>
<style scoped>
.joined-dorms {
  margin: 24px 0 32px;
  text-align: left;
}
h2 {
  font-size: 15px;
  color: #777;
  font-weight: 500;
  margin: 0 0 12px;
}
button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 17px;
  margin-bottom: 8px;
  border: 1px solid #eee;
  border-radius: 20px;
  background: #fafafa;
  color: #111;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
button > span {
  display: grid;
  gap: 5px;
  flex: 1;
  min-width: 0;
}
strong {
  font-size: 18px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}
button > span > span {
  font-size: 14px;
  color: #777;
}
button:active {
  transform: scale(0.98);
  background: #f0f0f0;
}
button:disabled {
  opacity: 0.55;
}
@media (prefers-reduced-motion: no-preference) {
  button {
    transition:
      transform 160ms ease,
      background-color 160ms ease;
  }
}
</style>
