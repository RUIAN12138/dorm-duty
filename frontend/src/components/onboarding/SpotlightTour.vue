<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
const props = defineProps<{ steps: { target: string; text: string }[] }>();
const emit = defineEmits<{ done: [] }>();
const noteTop = ref(100);
const trigger = document.activeElement as HTMLElement | null;
const index = ref(0),
  box = ref({ x: 16, y: 80, width: 44, height: 44 });
async function position() {
  await nextTick();
  const el = document.querySelector(props.steps[index.value]?.target || "none");
  if (el) {
    const r = el.getBoundingClientRect();
    noteTop.value =
      r.bottom + 180 > window.innerHeight
        ? Math.max(16, r.top - 170)
        : r.bottom + 24;
    box.value = {
      x: r.x - 6,
      y: r.y - 6,
      width: r.width + 12,
      height: r.height + 12,
    };
  }
}
watch(index, position, { immediate: true });
window.addEventListener("resize", position);
onBeforeUnmount(() => {
  window.removeEventListener("resize", position);
  if (trigger?.isConnected) trigger.focus({ preventScroll: true });
});
</script>
<template>
  <Teleport to="body"
    ><div
      class="tour"
      role="dialog"
      aria-modal="true"
      aria-label="功能引导"
      @keydown.esc="$emit('done')"
    >
      <div
        class="tour-light"
        :style="{
          left: `${box.x}px`,
          top: `${box.y}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
          borderRadius: `${Math.min(box.height/2,24)}px`,
        }"
      />
      <div
        class="tour-note"
        :style="{
          top: `${noteTop}px`,
        }"
      >
        <p>{{ steps[index]?.text }}</p>
        <div>
          <button @click="$emit('done')">跳过</button><button v-if="index>0" @click="index--">上一步</button
          ><button
            autofocus
            @click="index + 1 < steps.length ? index++ : emit('done')"
          >
            {{ index + 1 === steps.length ? "知道了" : "下一步" }}
          </button>
        </div>
      </div>
    </div></Teleport
  >
</template>
<style scoped>
.tour {
  position: fixed;
  inset: 0;
  z-index: 1800;
}
.tour-light {
  position: absolute;
  border-radius: 24px;
  box-shadow: 0 0 0 200vmax #0009;
  pointer-events: none;
  transition:
    transform 0.3s,
    left 0.3s var(--ui-ease-out),
    top 0.3s var(--ui-ease-out),
    width 0.3s var(--ui-ease-out),
    height 0.3s var(--ui-ease-out),border-radius 0.3s var(--ui-ease-out);
}
.tour-note {
  position: absolute;
  left: 24px;
  right: 24px;
  max-width: 420px;
  margin: auto;
  background: var(--canvas);
  color: var(--ink);
  padding: 20px;
  border-radius: 20px;
}
.tour-note p {
  margin: 0 0 20px;
  line-height: 1.5;
}
.tour-note div {
  display: flex;
  justify-content: space-between;
}
.tour button {
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  padding: 8px 12px;
  transition: transform 0.2s;
}
.tour button:active {
  transform: scale(0.96);
}
</style>
