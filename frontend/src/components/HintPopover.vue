<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
  PopoverArrow,
} from "reka-ui";
import { registerNativeBack } from "../interactions/nativeBack";
defineProps<{ title: string; text: string; label?: string }>();
const open = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let removeBack: (() => void) | undefined;
function pause() {
  clearTimeout(timer);
}
function schedule() {
  clearTimeout(timer);
  if (open.value)
    timer = setTimeout(() => {
      open.value = false;
    }, 6000);
}
watch(open, (value) => {
  clearTimeout(timer);
  removeBack?.();
  removeBack = value
    ? registerNativeBack(() => {
        open.value = false;
      })
    : undefined;
  if (value) schedule();
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  removeBack?.();
});
</script>
<template>
  <PopoverRoot v-model:open="open" :modal="false">
    <PopoverTrigger as-child
      ><button class="hint-trigger" type="button" :aria-label="label || title">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            stroke-width="1.4"
          />
          <path
            d="M9.8 9.3a2.2 2.2 0 1 1 3.7 1.6c-1.2.8-1.5 1.1-1.5 2.4M12 16.2h.01"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg></button
    ></PopoverTrigger>
    <PopoverPortal
      ><PopoverContent
        class="hint-popover"
        side="top"
        :side-offset="8"
        :collision-padding="16"
        :avoid-collisions="true"
        :aria-label="title"
        @open-auto-focus.prevent
        @pointerenter="pause"
        @pointerleave="schedule"
        @focusin="pause"
        @focusout="schedule"
      >
        <strong>{{ title }}</strong>
        <p>{{ text }}</p>
        <PopoverArrow
          class="hint-arrow"
          :width="12"
          :height="6"
        /> </PopoverContent
    ></PopoverPortal>
  </PopoverRoot>
</template>
<style>
.hint-trigger {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 6px;
  border: 0;
  border-radius: 50%;
  color: var(--ui-text-muted);
  background: transparent;
  cursor: pointer;
  vertical-align: middle;
  transition: transform var(--ui-release-time) var(--ui-ease-out);
}
.hint-trigger svg {
  width: 18px;
  height: 18px;
}
.hint-trigger:active {
  transform: scale(0.96);
  background: var(--ui-surface-muted);
}
.hint-trigger:focus-visible {
  outline: 2px solid var(--ui-ink);
  outline-offset: 2px;
}
.hint-popover {
  z-index: 4000;
  width: min(270px, calc(100vw - 32px));
  box-sizing: border-box;
  padding: 14px 16px;
  border: 1px solid var(--ui-border);
  border-radius: 18px;
  background: var(--ui-surface);
  color: var(--ui-ink);
  box-shadow: 0 6px 24px #00000012;
  outline: none;
  transform-origin: var(--reka-popover-content-transform-origin);
}
.hint-popover strong {
  display: block;
  font-size: 14px;
  line-height: 1.4;
  margin-bottom: 6px;
}
.hint-popover p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--ui-text-muted);
}
.hint-arrow {
  fill: var(--ui-surface);
}
@media (prefers-reduced-motion: no-preference) {
  .hint-popover[data-state="open"] {
    animation: hint-arrive 240ms cubic-bezier(0.22, 1.12, 0.36, 1);
  }
  .hint-popover[data-state="closed"] {
    animation: hint-depart 160ms var(--ui-ease-out);
  }
  @keyframes hint-arrive {
    from {
      opacity: 0;
      transform: scale(0.9) translateY(4px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
  @keyframes hint-depart {
    to {
      opacity: 0;
      transform: scale(0.94) translateY(3px);
    }
  }
}
</style>
