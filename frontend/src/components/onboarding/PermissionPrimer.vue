<script setup lang="ts">
import ElasticSheet from "../ElasticSheet.vue";
defineEmits<{ continue: []; cancel: [] }>();
</script>
<template>
  <ElasticSheet
    :model-value="true"
    title="接收宿舍提醒"
    motion="bottom"
    @update:model-value="!$event && $emit('cancel')"
    ><div class="permission-primer">
      <p>允许通知后，轮到值日、抬水或收到室友留言时，我们可以及时提醒你。</p>
      <p>下一步由系统询问；你也可以稍后在设置中开启。</p>
      <button @click="$emit('continue')">继续设置通知</button
      ><button class="later" @click="$emit('cancel')">暂不开启</button>
    </div></ElasticSheet
  >
</template>
<style scoped>
.permission-primer {
  display: grid;
  gap: 20px;
  padding: 8px 0 24px;
}
.permission-primer p {
  margin: 0;
  line-height: 1.6;
  color: var(--muted);
}
.permission-primer button {
  border: 0;
  border-radius: 28px;
  background: var(--ink);
  color: var(--canvas);
  padding: 15px;
  font: inherit;
  transition: transform 0.2s;
}
.permission-primer .later {
  background: none;
  color: var(--muted);
}
.permission-primer button:active {
  transform: scale(0.97);
}
</style>
