<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { ChoreMember, WaterHandoff } from "../api/chores";
import { consumeWaterHandoff } from "../interaction/waterHandoff";
import GalaxyCheck from "./GalaxyCheck.vue";
import { completionFeedback } from "../interaction/completionFeedback";
import { motionAllowed } from "../interaction/motion";
const props = defineProps<{
  scope: string;
  event?: WaterHandoff | null;
  members: ChoreMember[];
  targetId: number;
  targetName: string;
  active?: boolean;
}>();
const creditedName = ref("");
const badge = ref<HTMLElement>();
let cancelParticles: (() => void) | undefined;
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
  creditedName.value = "";
  cancelParticles?.();
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
  let previous = source;
  async function spin(target: string) {
    if (id !== generation) return false;
    creditedName.value = "";
    names.value = [
      previous,
      ...Array.from({ length: 4 }, () => lineup).flat(),
      target,
    ];
    rolling.value = true;
    await nextTick();
    if (id !== generation || !reel.value) return false;
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
      return false;
    }
    if (id !== generation) return false;
    previous = target;
    return true;
  }
  for (const step of props.event?.steps || []) {
    const name = props.members.find(
      (m) => m.user_id === step.member_id,
    )?.nickname;
    if (!name || !(await spin(name))) return;
    creditedName.value = name;
    await nextTick();
    cancelParticles = completionFeedback(badge.value?.getBoundingClientRect());
    await new Promise((resolve) => setTimeout(resolve, 850));
    if (id !== generation) return;
  }
  if (!(await spin(props.targetName))) return;
  // Crossfade only the landed glyphs, preserving the title's fixed footprint.
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
      <span
        v-if="creditedName"
        ref="badge"
        class="handoff-credit"
        data-testid="water-credit-complete"
        ><GalaxyCheck />{{ creditedName }} · 已完成</span
      >
      <span
        ref="reel"
        class="handoff-reel"
        :class="{ 'credit-hidden': creditedName }"
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

<style scoped>
.handoff-credit {
  position: absolute;
  inset: 0;
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  font-size: clamp(22px, 7vw, 34px);
  animation: credit-land 300ms var(--ui-ease-out) both;
}
.handoff-credit :deep(svg) {
  width: 28px;
  height: 28px;
}
.credit-hidden {
  opacity: 0;
}
@keyframes credit-land {
  0% {
    opacity: 0;
    transform: scale(0.94, 0.9);
  }
  65% {
    opacity: 1;
    transform: scale(1.025, 0.985);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
