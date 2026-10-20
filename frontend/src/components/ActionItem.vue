<script setup lang="ts">
import { computed, inject, ref, onMounted, type Ref } from "vue";
import { motion } from "motion-v";
import {
  motionAllowed,
  motionTokens,
  motionTiming,
} from "../interaction/motion";
const props = defineProps<{
  label: string;
  icon: string;
  tile?: boolean;
  badge?: number;
  disabled?: boolean;
  delay?: number;
}>();
const phase = inject<Ref<string>>("sheet-motion-phase", ref("open"));
const item = ref<{ $el?: HTMLElement }>();
const index = ref(0),
  total = ref(1);
onMounted(() => {
  const el = item.value?.$el;
  const items = el?.closest(".sheet-content")?.querySelectorAll(".action-item");
  if (el && items) {
    index.value = Array.from(items).indexOf(el);
    total.value = items.length;
  }
});
const closing = computed(() => phase.value === "closing");
const transition = computed(() =>
  motionAllowed()
    ? {
        ...motionTokens.enter,
        duration: motionTiming.drawer - 4 * motionTiming.stagger,
        delay:
          Math.min(
            4,
            closing.value ? total.value - 1 - index.value : index.value,
          ) * motionTiming.stagger,
      }
    : { duration: 0 },
);
</script>
<template>
  <motion.button
    ref="item"
    type="button"
    class="action-item"
    :class="{ tile }"
    :disabled="disabled"
    :while-press="!props.disabled && motionAllowed() ? { scale: 0.97 } : {}"
    :initial="motionAllowed() ? { opacity: 0, y: 6 } : false"
    :animate="
      closing && motionAllowed() ? { opacity: 0, y: 6 } : { opacity: 1, y: 0 }
    "
    :transition="transition"
  >
    <span class="action-icon"><van-icon :name="icon" aria-hidden="true" /></span
    ><span class="action-label">{{ label }}</span
    ><span v-if="badge" class="action-badge">{{ badge }}</span
    ><van-icon
      v-if="!tile"
      class="action-arrow"
      name="arrow"
      aria-hidden="true"
    />
  </motion.button>
</template>
<style scoped>
.action-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  min-height: 62px;
  padding: 10px 14px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: var(--app-tone-h111, #111);
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.action-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  font-size: 23px;
  border-radius: 12px;
  background: var(--app-tone-hf1f1f1, #f1f1f1);
}
.action-label {
  font-size: 16px;
  font-weight: 500;
  flex: 1;
}
.action-arrow {
  font-size: 15px;
  color: var(--app-tone-h999, #999);
}
.action-item:active {
  background: var(--app-tone-hefefef, #efefef);
}
.action-item:disabled {
  opacity: 0.4;
  cursor: default;
}
.tile {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 106px;
  gap: 11px;
  background: var(--app-tone-hf6f6f6, #f6f6f6);
  text-align: center;
  border-radius: 22px;
  padding: 16px 10px;
}
.tile .action-icon {
  background: transparent;
  width: 30px;
  height: 30px;
  font-size: 26px;
}
.tile .action-label {
  flex: none;
}
.action-badge {
  min-width: 21px;
  height: 21px;
  line-height: 21px;
  border-radius: 11px;
  text-align: center;
  background: var(--app-tone-h111, #111);
  color: var(--app-tone-hfff, #fff);
  font-size: 12px;
}
.tile .action-badge {
  position: absolute;
  top: 11px;
  right: 13px;
}
</style>

<style scoped>
/* Arrow feedback adapted from Uiverse nkhlrjrs hungry-pig-21 (MIT). */
@media (prefers-reduced-motion: no-preference) {
  .action-arrow {
    transition:
      transform var(--ui-page-time) var(--ui-ease-out),
      color 180ms ease;
  }
  .action-item:active .action-arrow {
    transform: translateX(3px);
    color: var(--app-tone-h111, #111);
  }
  .action-icon {
    transition: transform var(--ui-page-time) var(--ui-ease-out);
  }
  .action-item:active .action-icon {
    transform: scale(0.94);
  }
}
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  .action-item:hover .action-arrow {
    transform: translateX(3px);
    color: var(--app-tone-h111, #111);
  }
}
</style>
