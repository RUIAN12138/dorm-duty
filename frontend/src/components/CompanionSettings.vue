<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from "vue";
import DormCompanion from "./DormCompanion.vue";
import {
  emotions,
  emotionUses,
  companionPreview,
  companionEnabled,
  saveCompanionEnabled,
  displayedEmotion,
} from "../interaction/companion";
const baseUrl = import.meta.env.BASE_URL;
const touring = ref(false),
  closing = ref(false);
let tour: ReturnType<typeof setInterval> | undefined,
  closeTimer: ReturnType<typeof setTimeout> | undefined;
const selected = computed(
  () =>
    emotions.find(
      (e) => e.id === (companionPreview.value || displayedEmotion.value),
    ) || emotions[0],
);
const groups = [
  { id: "life", name: "日常 · 8" },
  { id: "emotion", name: "情绪 · 12" },
  { id: "agent", name: "行动 · 12" },
];
function stop() {
  clearInterval(tour);
  touring.value = false;
}
function select(id: string) {
  stop();
  companionPreview.value = id;
}
function automatic() {
  stop();
  companionPreview.value = "";
}
function play() {
  if (!emotions.length) return;
  if (touring.value) {
    stop();
    return;
  }
  let index = Math.max(
    0,
    emotions.findIndex((e) => e.id === companionPreview.value),
  );
  companionPreview.value = emotions[index].id;
  touring.value = true;
  tour = setInterval(() => {
    if (document.hidden) return;
    index = (index + 1) % emotions.length;
    companionPreview.value = emotions[index].id;
  }, 5000);
}
function toggle() {
  if (closing.value) return;
  if (!companionEnabled.value) {
    saveCompanionEnabled(true);
    automatic();
    return;
  }
  stop();
  companionPreview.value = "41";
  closing.value = true;
  closeTimer = setTimeout(() => {
    saveCompanionEnabled(false);
    companionPreview.value = "";
    closing.value = false;
  }, 700);
}
onBeforeUnmount(() => {
  stop();
  clearTimeout(closeTimer);
  companionPreview.value = "";
});
</script>
<template>
  <section class="emotion-preview" aria-label="球球的全部表情">
    <p v-if="!emotions.length" role="status">球球暂未加载，刷新页面后再试。</p>
    <div class="emotion-pinned">
      <div v-if="emotions.length" class="emotion-stage">
        <DormCompanion
          :key="companionEnabled ? 'on' : 'off'"
          :mood="selected?.id || '02'"
          :interactive="true"
          :size="120"
        />
        <div class="emotion-description">
          <span class="emotion-eyebrow">EMOTION BALL · {{ selected?.id }}</span
          ><strong>{{ selected?.name }}</strong>
          <p>{{ selected ? emotionUses[selected.id] : "" }}</p>
          <small>{{
            companionPreview
              ? "正在试看 · 页面里的球球同步变化"
              : "跟随任务 · 点击下面的表情试看"
          }}</small>
        </div>
      </div>
      <div class="emotion-controls">
        <button :class="{ selected: !companionPreview }" @click="automatic">
          跟随任务</button
        ><button :disabled="!emotions.length" @click="play">
          {{ touring ? "暂停轮播" : "轮播全部 32 种" }}</button
        ><button :disabled="closing" @click="toggle">
          {{
            closing ? "球球收工中…" : companionEnabled ? "隐藏球球" : "显示球球"
          }}
        </button>
      </div>
    </div>
    <details class="emotion-catalog">
      <summary>查看全部 32 种表情</summary>
      <div v-for="group in groups" :key="group.id" class="emotion-group">
        <h3>{{ group.name }}</h3>
        <div class="emotion-choices">
          <button
            v-for="emotion in emotions.filter((e) => e.group === group.id)"
            :key="emotion.id"
            :aria-pressed="companionPreview === emotion.id"
            :class="{ selected: companionPreview === emotion.id }"
            @click="select(emotion.id)"
          >
            {{ emotion.name }}
          </button>
        </div>
      </div>
    </details>
    <p class="emotion-credit">
      球球来自
      <a
        href="https://github.com/sam70361/aora-bot"
        target="_blank"
        rel="noopener noreferrer"
        >sam70361 / Emotion Ball ↗</a
      >
      · 个人学习使用 ·
      <a
        :href="`${baseUrl}vendor/emotion-ball/LICENSE.txt`"
        target="_blank"
        rel="noopener noreferrer"
        >许可</a
      >
    </p>
  </section>
</template>
<style scoped>
.emotion-preview {
  width: 100%;
  padding: 0 0 16px;
  color: var(--app-tone-h222, #222);
  border-bottom: 0;
}
.emotion-pinned {
  position: sticky;
  top: -4px;
  z-index: 5;
  background: var(--canvas, var(--app-tone-hfff, #fff));
  padding-bottom: 4px;
  border-bottom: 1px solid var(--app-tone-heee, #eee);
}
.emotion-catalog {
  padding-top: 18px;
}
.emotion-catalog summary {
  font-size: 13px;
  color: var(--app-tone-h666, #666);
  cursor: pointer;
  padding: 8px 0;
}
.emotion-stage {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 138px;
}
.emotion-description {
  min-width: 0;
  flex: 1;
}
.emotion-eyebrow {
  font-size: 9px;
  letter-spacing: 1.2px;
  color: var(--app-tone-h999, #999);
}
.emotion-description strong {
  display: block;
  font-size: 23px;
  letter-spacing: -0.5px;
  margin: 9px 0;
}
.emotion-description p {
  margin: 0;
  font-size: 12px !important;
  line-height: 1.7 !important;
  color: var(--app-tone-h555, #555);
}
.emotion-description small {
  display: block;
  margin-top: 8px;
  font-size: 10px;
  color: var(--app-tone-h999, #999);
}
.emotion-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 20px;
}
.emotion-group {
  margin: 16px 0;
}
.emotion-group h3 {
  font-size: 11px;
  font-weight: 500;
  color: var(--app-tone-h999, #999);
  margin: 0 0 9px;
}
.emotion-choices {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}
.emotion-preview button {
  border: 1px solid var(--app-tone-hddd, #ddd);
  background: var(--app-tone-hfff, #fff);
  color: var(--app-tone-h333, #333);
  font: inherit;
  cursor: pointer;
  font-size: 11px !important;
  padding: 9px 7px !important;
  border-radius: 12px !important;
  min-height: 36px;
  transition:
    background 180ms,
    color 180ms;
}
.emotion-preview button.selected {
  background: var(--app-tone-h222, #222) !important;
  color: var(--app-tone-hfff, #fff) !important;
  border-color: var(--app-tone-h222, #222) !important;
}
.emotion-credit {
  line-height: 1.8;
  font-size: 10px;
  color: var(--app-tone-h999, #999);
  margin-top: 20px !important;
}
.emotion-credit a {
  color: var(--app-tone-h666, #666);
  text-decoration: underline;
  text-underline-offset: 3px;
}
@media (max-width: 350px) {
  .emotion-pinned {
    position: sticky;
    top: -4px;
    z-index: 5;
    background: var(--canvas, var(--app-tone-hfff, #fff));
    padding-bottom: 4px;
    border-bottom: 1px solid var(--app-tone-heee, #eee);
  }
  .emotion-catalog {
    padding-top: 18px;
  }
  .emotion-catalog summary {
    font-size: 13px;
    color: var(--app-tone-h666, #666);
    cursor: pointer;
    padding: 8px 0;
  }
  .emotion-stage {
    gap: 0;
  }
  .emotion-stage :deep(.dorm-companion) {
    width: 128px !important;
    height: 128px !important;
  }
  .emotion-description strong {
    font-size: 20px;
  }
}
</style>
