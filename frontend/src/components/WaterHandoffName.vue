<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { ChoreMember, WaterHandoff } from "../api/chores";
import { consumeWaterHandoff } from "../interaction/waterHandoff";
import { motionAllowed } from "../interaction/motion";
const props = defineProps<{
  scope: string;
  event?: WaterHandoff | null;
  members: ChoreMember[];
  targetId: number;
  targetName: string;
  active?: boolean;
}>();
const rolling = ref(false),
  names = ref<string[]>([]),
  height = ref(80);
const content = ref<HTMLElement>(),
  reel = ref<HTMLElement>();
let animation: Animation | undefined,
  generation = 0;
function stop() {
  generation++;
  animation?.cancel();
  animation = undefined;
  rolling.value = false;
}
async function play() {
  stop();
  if (document.hidden || props.active === false) return;
  if (!consumeWaterHandoff(props.scope, props.event) || !motionAllowed())
    return;
  const id = generation;
  const source =
    props.members.find((m) => m.user_id === props.event?.from_member_id)
      ?.nickname || props.targetName;
  const lineup = props.members.map((m) => m.nickname);
  if (!lineup.length) return;
  height.value = Math.max(
    64,
    content.value?.getBoundingClientRect().height || 80,
  );
  names.value = [
    source,
    ...Array.from({ length: 4 }, () => lineup).flat(),
    props.targetName,
  ];
  rolling.value = true;
  await nextTick();
  if (id !== generation || !reel.value) return;
  const end = -(names.value.length - 1) * height.value;
  animation = reel.value.animate(
    [
      {
        transform: "translate3d(0,0,0)",
        easing: "cubic-bezier(.18,.02,.12,1)",
      },
      {
        transform: `translate3d(0,${end - 3}px,0)`,
        offset: 0.94,
        easing: "cubic-bezier(.22,1,.36,1)",
      },
      { transform: `translate3d(0,${end}px,0)` },
    ],
    { duration: 1700, easing: "linear", fill: "forwards" },
  );
  try {
    await animation.finished;
  } catch {
    return;
  }
  if (id !== generation) return;
  rolling.value = false;
  animation?.cancel();
  animation = undefined;
}
watch(
  [
    () => props.scope,
    () => props.event?.id,
    () => props.event?.completed_at,
    () => props.targetId,
    () => props.active,
  ],
  play,
  { immediate: true, flush: "post" },
);
function hidden() {
  if (document.hidden) stop();
  else void play();
}
document.addEventListener("visibilitychange", hidden);
const media = matchMedia("(prefers-reduced-motion: reduce)");
function preference() {
  if (media.matches) stop();
}
media.addEventListener("change", preference);
onBeforeUnmount(() => {
  stop();
  document.removeEventListener("visibilitychange", hidden);
  media.removeEventListener("change", preference);
});
</script>
<template>
  <span
    class="handoff-name"
    :class="{ rolling }"
    data-testid="water-handoff"
    :aria-busy="rolling"
  >
    <span
      ref="content"
      class="handoff-content"
      :inert="rolling ? true : undefined"
      ><slot
    /></span>
    <span
      v-if="rolling"
      class="handoff-window"
      :style="{ height: `${height}px`, '--reel-height': `${height}px` }"
      aria-hidden="true"
      data-testid="water-name-reel"
    >
      <span ref="reel" class="handoff-reel"
        ><span v-for="(name, i) in names" :key="i" class="handoff-row">{{
          name
        }}</span></span
      >
    </span>
  </span>
</template>
<style scoped>
.handoff-name {
  position: relative;
  display: block;
  width: 100%;
}
.handoff-content {
  display: block;
}
.rolling .handoff-content {
  visibility: hidden;
  pointer-events: none;
}
.handoff-window {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  transform: translateY(-50%);
  overflow: hidden;
  pointer-events: none;
  mask-image: linear-gradient(
    transparent,
    var(--app-tone-h000, #000) 18%,
    var(--app-tone-h000, #000) 82%,
    transparent
  );
}
.handoff-reel {
  display: block;
  will-change: transform;
}
.handoff-row {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--reel-height);
  white-space: nowrap;
  font-size: inherit;
  line-height: 1;
  letter-spacing: inherit;
}
</style>
