<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
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
  <DialogRoot v-model:open="open">
    <DialogTrigger as-child>
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
    </DialogTrigger>
    <DialogPortal>
      <DialogOverlay
        class="hint-glass"
        data-testid="hint-glass"
        @pointerdown.self.stop="open = false"
      />
      <DialogContent class="hint-popover" @escape-key-down.stop>
        <div class="hint-heading">
          <DialogTitle>{{ title }}</DialogTitle>
        </div>
        <DialogDescription>{{ text }}</DialogDescription>
        <DialogClose class="hint-confirm">知道了</DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
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
.hint-glass {
  position: fixed;
  inset: 0;
  z-index: 3999;
  background: transparent;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  pointer-events: auto;
}
.hint-popover {
  position: fixed;
  z-index: 4000;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(320px, calc(100vw - 40px));
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  padding: 22px;
  border: 1px solid rgb(255 255 255 / 90%);
  border-radius: 28px;
  background: rgb(255 255 255 / 97%);
  color: #222;
  box-shadow:
    0 20px 70px #00000014,
    0 2px 8px #00000005;
  outline: none;
}
.hint-heading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 16px;
  text-align: center;
}
.hint-heading h2 {
  margin: 0;
  font-size: 19px;
  line-height: 1.35;
  font-weight: 600;
  letter-spacing: -0.4px;
}
.hint-popover > p {
  margin: 0;
  font-size: 16px;
  line-height: 1.65;
  color: #666;
}
.hint-confirm {
  display: block;
  width: 100%;
  min-height: 46px;
  padding: 11px 16px;
  margin-top: 24px;
  border: 0;
  border-radius: 16px;
  color: #fff;
  background: #111;
  font: inherit;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
}
.hint-trigger:focus-visible,
.hint-confirm:focus-visible {
  outline: 2px solid #111;
  outline-offset: 3px;
}
.hint-confirm:active {
  transform: scaleX(1.02) scaleY(0.94);
}
@media (prefers-reduced-motion: no-preference) {
  .hint-trigger,
  .hint-confirm {
    transition:
      transform 140ms cubic-bezier(0.22, 1, 0.36, 1),
      background-color 140ms ease;
  }
  .hint-glass[data-state="open"] {
    animation: hint-glass-in 160ms ease-out;
  }
  .hint-glass[data-state="closed"] {
    animation: hint-glass-out 120ms ease-out;
  }
  .hint-popover[data-state="open"] {
    animation: hint-arrive 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .hint-popover[data-state="closed"] {
    animation: hint-depart 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes hint-glass-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes hint-glass-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  @keyframes hint-arrive {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 6px)) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
  @keyframes hint-depart {
    from {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    to {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 4px)) scale(0.98);
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  .hint-trigger:active,
  .hint-confirm:active {
    transform: none;
  }
}
@media (prefers-reduced-transparency: reduce) {
  .hint-glass {
    background: rgb(0 0 0 / 8%);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
</style>
