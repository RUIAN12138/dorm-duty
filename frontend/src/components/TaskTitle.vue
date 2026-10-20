<script setup lang="ts">
import { useAttrs } from "vue";
import { motionAllowed } from "../interaction/motion";
defineOptions({ inheritAttrs: false });
withDefaults(
  defineProps<{
    value: string | number;
    animated?: boolean;
    direction?: number;
  }>(),
  { animated: true, direction: 1 },
);
const attrs = useAttrs();
function leaving(el: Element) {
  el.setAttribute("inert", "");
  el.setAttribute("aria-hidden", "true");
  el.removeAttribute("id");
}
</script>
<template>
  <Transition
    :name="direction < 0 ? 'task-name-prev' : 'task-name-next'"
    :css="animated && motionAllowed()"
    @before-leave="leaving"
    ><h2 :key="value" v-bind="attrs"><slot /></h2
  ></Transition>
</template>
<style scoped>
.task-name-next-enter-active,
.task-name-prev-enter-active {
  transition:
    transform 300ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 220ms ease;
}
.task-name-next-leave-active,
.task-name-prev-leave-active {
  transition:
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 150ms ease;
  pointer-events: none;
}
.task-name-next-enter-from {
  transform: translateX(48px);
  opacity: 0;
}
.task-name-next-leave-to {
  transform: translateX(-36px);
  opacity: 0;
}
.task-name-prev-enter-from {
  transform: translateX(-48px);
  opacity: 0;
}
.task-name-prev-leave-to {
  transform: translateX(36px);
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .task-name-next-enter-active,
  .task-name-prev-enter-active,
  .task-name-next-leave-active,
  .task-name-prev-leave-active {
    transition: none;
  }
}
</style>
