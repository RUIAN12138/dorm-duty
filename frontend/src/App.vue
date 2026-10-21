<script setup lang="ts">
import { onMounted, onUnmounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { installInputMode } from "./interaction/inputMode";
import { registerSW } from "virtual:pwa-register";
import { useSession } from "./stores/session";
import { networkState } from "./api/network";
import { logoutEvent } from "./api/logout";
import { installNativeBack } from "./interactions/nativeBack";
import {
  configureUpdates,
  announceUpdate,
  installUpdate,
  updateReady as update,
} from "./interaction/appUpdates";
import ReleaseNotice from "./components/ReleaseNotice.vue";
let removeNativeBack: (() => void) | undefined;
const route = useRoute(),
  router = useRouter(),
  session = useSession();
const offline = computed(
  () => networkState.offline || networkState.unreachable,
);
registerSW({
  onRegisteredSW(_url, registration) {
    configureUpdates({ registration });
  },
  onNeedRefresh() {
    announceUpdate();
  },
});
const applyUpdate = (_reload = true) => installUpdate();
const active = computed(() =>
  route.path.startsWith("/schedule")
    ? "schedule"
    : route.path.startsWith("/history")
      ? "history"
      : route.path.startsWith("/profile") || route.path.startsWith("/dorm")
        ? "profile"
        : "home",
);
function network() {
  networkState.offline = !navigator.onLine;
}
let removeInputMode: (() => void) | undefined;
function signedOut() {
  session.clear();
  if (!route.meta.public) void router.replace("/");
}
function expired() {
  session.clear();
  if (!route.meta.public) router.replace("/");
}
onMounted(() => {
  removeNativeBack = installNativeBack();
  window.addEventListener("online", network);
  window.addEventListener("offline", network);
  window.addEventListener("auth-expired", expired);
  window.addEventListener(logoutEvent, signedOut);
  removeInputMode = installInputMode();
});
onUnmounted(() => {
  removeNativeBack?.();
  window.removeEventListener("online", network);
  window.removeEventListener("offline", network);
  window.removeEventListener("auth-expired", expired);
  window.removeEventListener(logoutEvent, signedOut);
  removeInputMode?.();
});
</script>
<template>
  <div class="app-shell">
    <div v-if="offline" class="connection-banner" role="status">
      {{ networkState.offline ? "当前离线" : "连接服务失败" }} ·
      查看最新任务需要联网
    </div>
    <div v-if="update" class="update-banner">
      有新版本可用
      <button @click="applyUpdate(true).catch(() => {})">更新页面</button>
    </div>
    <router-view />
    <ReleaseNotice
      :update-ready="update"
      :apply-update="() => applyUpdate(true)"
    />
    <nav
      v-if="session.user && !route.meta.public"
      class="bottom-nav"
      aria-label="主导航"
    >
      <router-link to="/manage" :class="{ selected: active === 'home' }"
        ><van-icon aria-hidden="true" name="wap-home-o" /><span
          >首页</span
        ></router-link
      >
      <router-link to="/schedule" :class="{ selected: active === 'schedule' }"
        ><van-icon aria-hidden="true" name="calendar-o" /><span
          >排班</span
        ></router-link
      >
      <router-link to="/history" :class="{ selected: active === 'history' }"
        ><van-icon aria-hidden="true" name="todo-list-o" /><span
          >记录</span
        ></router-link
      >
      <router-link to="/profile" :class="{ selected: active === 'profile' }"
        ><van-icon aria-hidden="true" name="user-o" /><span
          >我的</span
        ></router-link
      >
    </nav>
  </div>
</template>
