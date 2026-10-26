<script setup lang="ts">
import {
  computed,
  ref,
  onMounted,
  onBeforeUnmount,
  watch,
  nextTick,
} from "vue";
import DormCompanion from "./DormCompanion.vue";
import { startupOrbit, type StartupStatus } from "../interaction/startup";
const props = defineProps<{ status: StartupStatus }>();
const orbit = ref<HTMLElement>();
const flights: Animation[] = [];
let media: MediaQueryList;
function pause() {
  flights.forEach((f) =>
    document.hidden || props.status === "recovery-failed"
      ? f.pause()
      : f.play(),
  );
}
function stop() {
  flights.splice(0).forEach((f) => f.cancel());
}
async function start() {
  stop();
  await nextTick();
  if (!orbit.value || media?.matches) return;
  orbit.value.querySelectorAll("i").forEach((el, i) => {
    const frames = Array.from({ length: 97 }, (_, n) => {
      const p = startupOrbit((n / 96) * Math.PI * 2, (i * Math.PI) / 2);
      return { transform: `translate(${p.x}px,${p.y}px)` };
    });
    flights.push(el.animate(frames, { duration: 3200, iterations: Infinity }));
  });
  pause();
}
onMounted(() => {
  media = matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", start);
  document.addEventListener("visibilitychange", pause);
  void start();
});
watch(
  () => props.status,
  () => {
    if (visible.value) void start();
    else stop();
  },
);
onBeforeUnmount(() => {
  stop();
  media?.removeEventListener("change", start);
  document.removeEventListener("visibilitychange", pause);
});

defineEmits<{ retry: [] }>();
const visible = computed(() =>
  ["initializing", "verifying", "recovery-failed"].includes(props.status),
);
</script>
<template>
  <Transition name="startup">
    <section
      v-if="visible"
      class="startup-gate"
      :data-startup="status"
      aria-label="正在恢复身份"
      role="status"
    >
      <div
        ref="orbit"
        class="startup-orbit"
        :class="{ stopped: status === 'recovery-failed' }"
      >
        <DormCompanion
          :size="92"
          :interactive="false"
          :automatic="false"
          :track="false"
        />
        <i v-for="n in 4" :key="n" />
      </div>
      <template v-if="status === 'recovery-failed'">
        <p>暂时无法恢复，请联网后重试</p>
        <button @click="$emit('retry')">重试</button>
      </template>
    </section>
  </Transition>
</template>
<style scoped>
.startup-gate {
  position: fixed;
  inset: 0;
  z-index: 180;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  background: var(--canvas, #fff);
  color: var(--ink, #111);
}
.startup-orbit {
  position: relative;
  width: 132px;
  height: 132px;
  display: grid;
  place-items: center;
}
.startup-orbit i {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 4px;
  margin: -2px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.28;
}
.stopped i {
  animation-play-state: paused;
}
.startup-gate button {
  padding: 12px 28px;
  border: 0;
  border-radius: 24px;
  background: var(--ink, #111);
  color: var(--canvas, #fff);
}
.startup-leave-active {
  transition:
    opacity 220ms var(--ui-ease-out),
    transform 320ms cubic-bezier(0.22, 1.1, 0.36, 1);
  pointer-events: none;
}
.startup-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
@media (prefers-reduced-motion: reduce) {
  .startup-orbit i {
    animation: none;
    display: none;
  }
  .startup-leave-active {
    transition: none;
  }
}
</style>
