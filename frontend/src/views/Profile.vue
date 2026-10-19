<script setup lang="ts">
import { ref } from "vue";
import { logoutAll } from "../api/logout";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import { useSession } from "../stores/session";
import { api, patch, post } from "../api";
import { enablePush, disableDevice, pushCapability } from "../api/push";
import { useLoad } from "../components/useLoad";
const session = useSession(),
  router = useRouter(),
  nickname = ref(""),
  busy = ref(false),
  pushConfig = ref<{ available: boolean } | null>(null),
  permission = ref(
    "Notification" in window ? Notification.permission : "unsupported",
  ),
  cap = pushCapability();
const { loading, error, refresh } = useLoad(async (signal) => {
  await session.refresh();
  if (signal.aborted) return;
  nickname.value = session.user?.nickname || "";
  pushConfig.value = await api<{ available: boolean }>("/push/public-key", {
    signal,
  });
});
async function act(fn: () => Promise<unknown>, message: string) {
  busy.value = true;
  try {
    await fn();
    showToast(message);
    await refresh();
    permission.value =
      "Notification" in window ? Notification.permission : "unsupported";
  } catch (e) {
    showToast((e as Error).message);
  } finally {
    busy.value = false;
  }
}
async function logout() {
  busy.value = true;
  let warning = "";
  try {
    await disableDevice();
  } catch {
    warning = "本设备通知订阅未撤销。";
  }
  try {
    await logoutAll();
  } catch (e) {
    warning += (e as Error).message;
  } finally {
    session.clear();
    await router.replace("/");
    busy.value = false;
    if (warning) showToast({ message: warning, duration: 5000 });
  }
}
</script>
<template>
  <main class="page">
    <div class="section-heading">
      <span class="eyebrow">MY LITTLE CORNER</span>
      <h1>我的</h1>
      <p>你的信息，以及温柔的提醒。</p>
    </div>
    <div v-if="error" class="error-panel">
      {{ error }}<van-button size="small" @click="refresh">重试</van-button>
    </div>
    <div class="profile-card">
      <span class="avatar-large">{{ session.user?.nickname.slice(0, 1) }}</span>
      <div>
        <h2>{{ session.user?.nickname }}</h2>
        <p>
          {{ session.user?.username }} ·
          {{ session.dorm?.name || "尚未加入宿舍" }}
        </p>
      </div>
    </div>
    <div class="section-title"><h2>个人资料</h2></div>
    <van-form @submit="act(() => patch('/auth/me', { nickname }), '昵称已更新')"
      ><div class="form-card">
        <van-field
          :disabled="loading || busy"
          v-model="nickname"
          label="昵称"
          maxlength="32"
          :rules="[{ required: true, message: '昵称不能为空' }]"
        />
      </div>
      <van-button
        block
        plain
        type="primary"
        native-type="submit"
        class="spaced"
        :disabled="loading"
        :loading="busy"
        >保存昵称</van-button
      ></van-form
    >
    <div class="section-title">
      <h2>值日提醒</h2>
      <span class="subtle">站内 + 系统通知</span>
    </div>
    <div class="detail-card notification-settings">
      <p>前一天 21:00 · 当天 08:00 · 未完成时 19:00</p>
      <router-link to="/messages" class="inline-link"
        >查看站内消息 <van-icon aria-hidden="true" name="arrow"
      /></router-link>
      <p v-if="pushConfig?.available === false" class="helper">
        系统通知暂未开通，站内提醒正常使用。
      </p>
      <div class="notification-state">
        系统权限：{{
          permission === "granted"
            ? "已允许"
            : permission === "denied"
              ? "已拒绝"
              : permission === "unsupported"
                ? "当前环境不支持"
                : "尚未授权"
        }}<br />账号推送：{{ session.user?.push_enabled ? "开启" : "关闭" }}
      </div>
      <p v-if="!cap.standalone" class="helper">
        iPhone 用户：在 Safari
        分享菜单选择“添加到主屏幕”，从桌面图标打开，再开启通知。需要 iOS 16.4
        或更新版本及 HTTPS。
      </p>
      <p v-if="permission === 'denied'" class="helper">
        请在手机系统设置中找到本应用，允许通知后再试。
      </p>
      <van-button
        block
        type="primary"
        :loading="busy"
        :disabled="
          !pushConfig?.available ||
          !cap.supported ||
          (cap.ios && !cap.standalone)
        "
        @click="act(enablePush, '本设备已开启系统通知')"
        >开启本设备通知</van-button
      >
      <div class="button-row spaced">
        <van-button
          size="small"
          :disabled="busy || !pushConfig?.available"
          @click="
            act(() => post('/push/test'), '测试通知已加入队列，稍后查看锁屏')
          "
          >发送测试通知</van-button
        ><van-button
          size="small"
          :disabled="busy"
          @click="
            act(async () => {
              await disableDevice();
              await patch('/auth/me', { push_enabled: false });
            }, '系统推送已关闭')
          "
          >关闭系统推送</van-button
        >
      </div>
    </div>
    <van-cell
      title="宿舍管理"
      :value="session.dorm?.name || '创建 / 加入'"
      is-link
      to="/dorm"
      class="spaced"
    />
    <van-button block plain class="spaced" :loading="busy" @click="logout"
      >退出登录</van-button
    >
    <p class="helper">退出会撤销本设备的登录凭据和邮箱会话。</p>
  </main>
</template>
