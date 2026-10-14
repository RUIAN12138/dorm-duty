<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { registerSW } from "virtual:pwa-register";
import { useSession } from "./stores/session";
import { networkState } from "./api/network";
import { installNativeBack } from "./interactions/nativeBack";
let removeNativeBack: (() => void) | undefined;
const route = useRoute(),
  router = useRouter(),
  session = useSession();
const offline = computed(
    () => networkState.offline || networkState.unreachable,
  ),
  update = ref(false);
const applyUpdate = registerSW({
  onNeedRefresh() {
    update.value = true;
  },
});
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
function keyboardMode() {
  document.documentElement.dataset.interaction = "keyboard";
}
function pointerMode() {
  document.documentElement.dataset.interaction = "pointer";
}
function expired() {
  session.clear();
  if (!route.meta.public)
    router.replace({ path: "/admin/login", query: { next: route.fullPath } });
}
onMounted(() => {
  removeNativeBack = installNativeBack();
  window.addEventListener("online", network);
  window.addEventListener("offline", network);
  window.addEventListener("auth-expired", expired);
  window.addEventListener("keydown", keyboardMode);
  window.addEventListener("pointerdown", pointerMode);
});
onUnmounted(() => {
  removeNativeBack?.();
  window.removeEventListener("online", network);
  window.removeEventListener("offline", network);
  window.removeEventListener("auth-expired", expired);
  window.removeEventListener("keydown", keyboardMode);
  window.removeEventListener("pointerdown", pointerMode);
});
</script>
<template>
  <div class="app-shell">
    <div v-if="offline" class="connection-banner" role="status">
      {{ networkState.offline ? "当前离线" : "连接服务失败" }} ·
      查看最新任务需要联网
    </div>
    <div v-if="update" class="update-banner">
      有新版本可用 <button @click="applyUpdate(true)">更新页面</button>
    </div>
    <router-view />
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
