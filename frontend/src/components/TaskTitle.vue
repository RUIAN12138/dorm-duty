<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { motionAllowed } from "../interaction/motion";
const props = withDefaults(
  defineProps<{ value: string | number; animated?: boolean }>(),
  { animated: true },
);
const element = ref<HTMLElement>();
let animation: Animation | undefined;
watch(
  () => props.value,
  () => {
    const el = element.value;
    if (!el) return;
    const computed = getComputedStyle(el);
    const opacity = animation ? Math.max(0.72, Number(computed.opacity)) : 0.72;
    const transform = animation ? computed.transform : "translateY(3px)";
    animation?.cancel();
    animation = undefined;
    if (!props.animated || !motionAllowed() || document.hidden) return;
    // The latest label is rendered immediately. Keep it readable even if another
    // selection interrupts before the previous transition has finished.
    animation = el.animate(
      [
        { opacity, transform },
        { opacity: 1, transform: "translateY(0px)" },
      ],
      { duration: 140, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    const current = animation;
    current.onfinish = () => {
      if (animation === current) animation = undefined;
    };
  },
  { flush: "post" },
);
onBeforeUnmount(() => animation?.cancel());
</script>
<template>
  <h2 ref="element"><slot /></h2>
</template>
