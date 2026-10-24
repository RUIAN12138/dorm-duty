<script setup lang="ts">
import { ref } from "vue";
import DormCompanion from "../DormCompanion.vue";
defineEmits<{ start: [] }>();
const index = ref(0);
const slides = [
  ["一起照顾宿舍", "把任务分清楚，让日常更轻松。"],
  ["按你们的方式轮换", "每项任务，自己定规则。"],
  ["先看一遍，再邀请", "调整页面顺序，确认后再创建。"],
];
function scroll(e: Event) {
  const el = e.currentTarget as HTMLElement;
  index.value = Math.round(el.scrollLeft / el.clientWidth);
  el.style.setProperty("--progress", String(el.scrollLeft / el.clientWidth));
}
</script>
<template>
  <div class="welcome">
    <div class="welcome-slides" @scroll.passive="scroll">
      <section v-for="(slide, i) in slides" :key="i" :style="{ '--slide': i }">
        <div class="welcome-art">
          <DormCompanion
            :size="110"
            :interactive="false"
            :mood="i === 1 ? '03' : '02'"
          />
        </div>
        <h1>{{ slide[0] }}</h1>
        <p>{{ slide[1] }}</p>
      </section>
    </div>
    <div class="welcome-dots" aria-label="引导页码">
      <i v-for="n in 3" :key="n" :class="{ current: index === n - 1 }" />
    </div>
    <Transition name="welcome-start"
      ><button v-if="index === 2" @click="$emit('start')">开始设置</button
      ><button v-else class="welcome-skip" @click="$emit('start')">
        跳过介绍
      </button></Transition
    >
  </div>
</template>
<style scoped>
.welcome {
  text-align: center;
  padding: 16px 0 32px;
}
.welcome-slides {
  display: flex;
  overflow: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}
.welcome-slides::-webkit-scrollbar {
  display: none;
}
.welcome-slides section {
  flex: 0 0 100%;
  scroll-snap-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 380px;
  gap: 24px;
}
.welcome h1 {
  font-size: 30px;
  line-height: 1.2;
  max-width: 9em;
  margin: 0;
}
.welcome p {
  color: var(--muted);
  max-width: 17em;
  margin: 0;
  line-height: 1.6;
}
.welcome-dots {
  display: flex;
  justify-content: center;
  gap: 7px;
  margin: 24px;
}
.welcome-dots i {
  width: 6px;
  height: 6px;
  border-radius: 5px;
  background: var(--line);
  transition:
    width 240ms var(--ui-ease-out),
    background 180ms;
}
.welcome-dots .current {
  width: 22px;
  background: var(--ink);
}
.welcome button {
  border: 0;
  background: var(--ink);
  color: var(--canvas);
  padding: 15px 32px;
  border-radius: 28px;
  font: inherit;
}
.welcome .welcome-skip {
  background: none;
  color: var(--muted);
}
.welcome-start-enter-active {
  transition:
    opacity 0.22s,
    transform 0.28s var(--ui-ease-out);
}
.welcome-start-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}
</style>

<style scoped>
.welcome-art {
  transform: translateX(calc((var(--slide) - var(--progress, 0)) * 12px));
}
@media (prefers-reduced-motion: reduce) {
  .welcome-art {
    transform: none;
  }
  .welcome-dots i {
    transition: none;
  }
}
</style>
