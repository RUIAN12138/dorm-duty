<script setup lang="ts">
import { computed } from "vue";
import ActionItem from "./ActionItem.vue";
import {
  installedVersion,
  latestVersion,
  updateReady,
  updatePhase,
  updateError,
  updateBusy,
  checkForUpdates,
  installUpdate,
} from "../interaction/appUpdates";
const label = computed(() =>
  updatePhase.value === "checking"
    ? "正在检查更新…"
    : updatePhase.value === "installing"
      ? "正在更新…"
      : updateReady.value
        ? "发现新版本 · 立即更新"
        : updatePhase.value === "current"
          ? "已是最新版本 · 再次检查"
          : "检查更新",
);
const version =
  installedVersion.match(/v\d+$/i)?.[0] || installedVersion || "开发版本";
function activate() {
  if (updateReady.value) void installUpdate().catch(() => {});
  else void checkForUpdates();
}
</script>
<template>
  <div class="settings-update" data-testid="settings-update">
    <ActionItem
      :label="label"
      :icon="updateBusy ? 'replay' : updateReady ? 'upgrade' : 'replay'"
      :disabled="updateBusy"
      :aria-busy="updateBusy"
      data-testid="check-update"
      @click="activate"
    />
    <p
      class="update-result"
      :role="updateError ? 'alert' : 'status'"
      aria-live="polite"
    >
      <Transition name="update-status" mode="out-in"
        ><span :key="updateError || updatePhase">{{
          updateError ||
          (updateReady && latestVersion
            ? `新版本 ${latestVersion.match(/v\d+$/i)?.[0] || latestVersion}`
            : `当前版本 ${version}`)
        }}</span></Transition
      >
    </p>
  </div>
</template>
<style scoped>
.settings-update {
  margin-top: 16px;
  border-top: 1px solid var(--ui-border);
  padding-top: 8px;
}
.update-result {
  min-height: 22px;
  margin: 0 14px 12px 63px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}
.update-result[role="alert"] {
  color: var(--ui-ink);
}
.settings-update :deep([aria-busy="true"] .action-icon .van-icon) {
  animation: update-check-spin 0.8s linear infinite;
}
@keyframes update-check-spin {
  to {
    transform: rotate(360deg);
  }
}
.update-status-enter-active,
.update-status-leave-active {
  transition:
    opacity 140ms var(--ui-ease-out),
    transform 140ms var(--ui-ease-out);
}
.update-status-enter-from {
  opacity: 0;
  transform: translateY(3px);
}
.update-status-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
@media (prefers-reduced-motion: reduce) {
  .settings-update :deep(.van-icon) {
    animation: none !important;
  }
  .update-status-enter-active,
  .update-status-leave-active {
    transition: none;
  }
}
</style>
