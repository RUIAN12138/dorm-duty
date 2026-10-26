<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import ChoreBottomNav from "../components/ChoreBottomNav.vue";
const route = useRoute();
const section = computed(() =>
  route.path.endsWith("/water")
    ? "water"
    : route.path.endsWith("/calendar")
      ? "calendar"
      : "duty",
);
const mode = ref("existing");
let effect: { destroy: () => void } | undefined;
async function toggle() {
  effect?.destroy();
  effect = undefined;
  if (mode.value === "experiment") {
    mode.value = "existing";
    return;
  }
  const nav =
    (document.querySelector(".chore-bottom-nav") as HTMLElement) ||
    document.querySelector("nav")!;
  const source = document.createElement("canvas");
  source.width = nav.clientWidth;
  source.height = nav.clientHeight;
  const ctx = source.getContext("2d")!;
  ctx.fillStyle = "#eee";
  ctx.fillRect(0, 0, source.width, source.height);
  for (let x = 0; x < source.width; x += 16) {
    ctx.fillStyle = "#999";
    ctx.fillRect(x, 0, 2, source.height);
  }
  // @ts-expect-error local JS experiment is deliberately outside application runtime.
  const { mountNavGlass } = await import("./navGlass.js");
  effect = mountNavGlass(nav, source);
  mode.value = "experiment";
}
onBeforeUnmount(() => effect?.destroy());
</script>
<template>
  <main class="optics-demo">
    <h1>导航光学隔离实验</h1>
    <p>原组件、原手势；背景为校准条纹，不连接业务数据。</p>
    <button @click="toggle">
      {{ mode === "existing" ? "试验新渲染层" : "恢复原效果" }}
    </button>
    <p>当前：{{ mode }}</p>
    <ChoreBottomNav :section="section" />
  </main>
</template>
<style scoped>
.optics-demo {
  padding: 32px 24px;
  font-family: system-ui;
  background: var(--canvas);
  min-height: 100dvh;
}
.optics-demo button {
  border: 1px solid #aaa;
  border-radius: 24px;
  padding: 12px 20px;
  transition: transform 0.2s;
}
.optics-demo button:active {
  transform: scale(0.97);
}
</style>
