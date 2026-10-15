<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
  PopoverClose,
} from "reka-ui";
import { registerNativeBack } from "../interactions/nativeBack";
defineProps<{ title: string; text: string; label?: string }>();
const open = ref(false);
let removeBack: (() => void) | undefined;
watch(open, (value) => {
  removeBack?.();
  removeBack = value
    ? registerNativeBack(() => (open.value = false))
    : undefined;
});
onBeforeUnmount(() => removeBack?.());
</script>
<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button class="hint-trigger" type="button" :aria-label="label || title">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="8.5"
            stroke="currentColor"
            stroke-width="1.4"
          />
          <path
            d="M9.8 9.3a2.2 2.2 0 1 1 3.7 1.6c-1.2.8-1.5 1.1-1.5 2.4M12 16.2h.01"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        class="hint-popover"
        side="top"
        align="end"
        :side-offset="10"
        :collision-padding="20"
        role="dialog"
        :aria-label="title"
      >
        <div class="hint-heading">
          <strong>{{ title }}</strong
          ><PopoverClose class="hint-close" aria-label="关闭提示"
            >×</PopoverClose
          >
        </div>
        <p>{{ text }}</p>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
<style>
.hint-trigger {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  color: #888;
  background: transparent;
  cursor: pointer;
  vertical-align: middle;
}
.hint-trigger svg {
  width: 22px;
  height: 22px;
}
.hint-trigger:active {
  transform: scale(0.92);
  background: #f3f3f3;
}
.hint-popover {
  z-index: 4000;
  width: min(280px, calc(100vw - 40px));
  padding: 16px 18px 18px;
  border: 1px solid #e8e8e8;
  border-radius: 22px;
  background: #fff;
  color: #222;
  box-shadow:
    0 12px 40px #00000012,
    0 2px 6px #00000006;
  outline: none;
  transform-origin: var(--reka-popover-content-transform-origin);
}
.hint-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.hint-heading strong {
  font-size: 16px;
  font-weight: 600;
}
.hint-close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #777;
  background: #f5f5f5;
  font-size: 22px;
  cursor: pointer;
}
.hint-popover p {
  margin: 12px 0 0;
  font-size: 15px;
  line-height: 1.65;
  color: #666;
}
.hint-trigger:focus-visible,
.hint-close:focus-visible {
  outline: 2px solid #111;
  outline-offset: 3px;
}
@media (prefers-reduced-motion: no-preference) {
  .hint-trigger {
    transition:
      transform 140ms cubic-bezier(0.22, 1, 0.36, 1),
      background-color 140ms ease;
  }
  .hint-popover[data-state="open"] {
    animation: hint-arrive 160ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes hint-arrive {
    from {
      opacity: 0;
      transform: translateY(3px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  .hint-trigger:active {
    transform: none;
  }
}
</style>
