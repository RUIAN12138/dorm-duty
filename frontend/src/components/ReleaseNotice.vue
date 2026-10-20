<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "reka-ui";
import { registerNativeBack } from "../interactions/nativeBack";

const props = defineProps<{
  updateReady: boolean;
  applyUpdate: () => Promise<void>;
}>();
const version = import.meta.env.VITE_RELEASE_VERSION || "";
const displayVersion = version.match(/v\d+$/i)?.[0] || version;
const storageKey = "lundao-release-notices-v1";
const open = ref(false),
  pending = ref(false),
  busy = ref(false),
  error = ref("");
let timer: ReturnType<typeof setTimeout> | undefined;
let removeBack: (() => void) | undefined;
// Acknowledging one release must not suppress notices for later releases.
let acknowledged = false;
function seenVersions(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(saved)
      ? saved.filter((v): v is string => typeof v === "string").slice(-20)
      : [];
  } catch {
    return [];
  }
}
function schedule() {
  clearTimeout(timer);
  if (
    open.value ||
    (!props.updateReady &&
      (!version || acknowledged || seenVersions().includes(version)))
  )
    return;
  timer = setTimeout(() => {
    // Do not cover an active form, another sheet, or an existing dialog.
    if (
      document.hidden ||
      document.querySelector('.sheet-layer, [role="dialog"]') ||
      document.activeElement?.matches("input,textarea,select")
    )
      return schedule();
    pending.value = props.updateReady;
    open.value = true;
  }, 700);
}
function close() {
  if (busy.value) return;
  if (!pending.value && version) {
    acknowledged = true;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(
          [...seenVersions().filter((v) => v !== version), version].slice(-20),
        ),
      );
    } catch {}
  }
  open.value = false;
}
async function confirm() {
  if (!pending.value) return close();
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await props.applyUpdate();
  } catch {
    error.value = "暂时无法更新，请稍后重试。";
    busy.value = false;
  }
}
watch(
  () => props.updateReady,
  () => {
    if (open.value && !pending.value) pending.value = true;
    else schedule();
  },
);
watch(open, (value) => {
  removeBack?.();
  removeBack = value ? registerNativeBack(close) : undefined;
});
function storage(event: StorageEvent) {
  if (
    event.key === storageKey &&
    !pending.value &&
    seenVersions().includes(version)
  )
    open.value = false;
}
onMounted(() => {
  schedule();
  window.addEventListener("storage", storage);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  removeBack?.();
  window.removeEventListener("storage", storage);
});
</script>
<template>
  <DialogRoot
    :open="open"
    @update:open="
      (value) => {
        if (!value) close();
      }
    "
  >
    <DialogPortal>
      <DialogOverlay class="release-shade" />
      <DialogContent
        class="release-notice"
        data-testid="release-notice"
        :data-release="version"
        @escape-key-down="
          (event) => {
            if (busy) event.preventDefault();
          }
        "
        @interact-outside="
          (event) => {
            if (busy) event.preventDefault();
          }
        "
      >
        <DialogTitle>{{ pending ? "发现新版本" : "已更新" }}</DialogTitle>
        <DialogDescription>
          {{ pending ? "新版已准备好，更新后查看本次变化。" : displayVersion }}
        </DialogDescription>
        <ul v-if="!pending" class="release-changes">
          <li>统计：从白色逐渐变灰，颜色过渡更自然</li>
          <li>消息浮窗加宽，修复底层文字叠穿</li>
          <li>前台收到消息后不再补发邮件</li>
        </ul>
        <p v-if="error" class="release-error" role="alert">{{ error }}</p>
        <button
          class="release-confirm galaxy-fill"
          :disabled="busy"
          :aria-busy="busy"
          @click="confirm"
        >
          {{ busy ? "正在更新…" : pending ? "更新页面" : "知道了" }}
        </button>
        <button
          v-if="pending"
          class="release-later"
          :disabled="busy"
          @click="close"
        >
          稍后
        </button>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
<style scoped>
.release-shade {
  position: fixed;
  inset: 0;
  z-index: 4100;
  background: #00000038;
}
.release-notice {
  position: fixed;
  z-index: 4101;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(344px, calc(100vw - 40px));
  max-height: 75dvh;
  overflow-y: auto;
  padding: 24px;
  border-radius: 28px;
  border: 1px solid var(--ui-border);
  background: var(--ui-surface);
  color: var(--ui-ink);
  outline: none;
}
.release-notice h2 {
  margin: 0;
  text-align: center;
  font-size: 22px;
  line-height: 1.2;
}
.release-notice > p {
  text-align: center;
  font-size: 14px;
  color: var(--ui-text-muted);
  margin: 14px 0 0;
  overflow-wrap: anywhere;
}
.release-changes {
  display: grid;
  gap: 14px;
  padding-left: 20px;
  margin: 24px 0;
  font-size: 16px;
  line-height: 1.5;
}
.release-confirm,
.release-later {
  width: 100%;
  min-height: 48px;
  border: 0;
  border-radius: 16px;
  font: inherit;
  cursor: pointer;
}
.release-confirm {
  background: var(--ui-ink);
  color: var(--ui-surface);
  margin-top: 24px;
}
.release-later {
  background: transparent;
  color: var(--ui-text-muted);
  margin-top: 8px;
}
.release-confirm:not(:disabled):active,
.release-later:not(:disabled):active {
  transform: var(--ui-press-small);
}
.release-error {
  color: var(--ui-ink) !important;
}
@media (prefers-reduced-motion: no-preference) {
  .release-confirm,
  .release-later {
    transition: transform var(--ui-release-time) var(--ui-ease-out);
  }
  .release-notice[data-state="open"] {
    animation: release-arrive 250ms var(--ui-ease-out) both;
  }
  .release-notice[data-state="closed"] {
    animation: release-depart 180ms var(--ui-ease-out) both;
  }
  .release-shade[data-state="open"] {
    animation: release-shade-in 250ms ease-out both;
  }
  .release-shade[data-state="closed"] {
    animation: release-shade-in 180ms ease-out reverse both;
  }
}
@keyframes release-arrive {
  0% {
    opacity: 0;
    transform: translate(-50%, calc(-50% + 8px)) scale(0.95);
  }
  72% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.012);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
@keyframes release-depart {
  to {
    opacity: 0;
    transform: translate(-50%, calc(-50% + 4px)) scale(0.97);
  }
}
@keyframes release-shade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
