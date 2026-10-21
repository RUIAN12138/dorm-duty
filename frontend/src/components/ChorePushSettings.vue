<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { showToast } from "vant";
import ElasticSheet from "./ElasticSheet.vue";
import SettingsSkeleton from "./SettingsSkeleton.vue";
import { pushCapability } from "../api/push";
import { onNativePushReady } from "../api/nativePush";
import TimedReminderSettings from "./TimedReminderSettings.vue";
import CalendarSubscriptionSettings from "./CalendarSubscriptionSettings.vue";
import {
  getMemberPushConfig,
  enableMemberPush,
  disableMemberPush,
  testMemberPush,
  syncMemberPush,
  type MemberPushConfig,
} from "../api/memberPush";
const props = defineProps<{
  modelValue: boolean;
  token: string;
  nickname: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  closed: [];
}>();
const config = ref<MemberPushConfig | null>(null),
  enabled = ref(false),
  busy = ref(false),
  loading = ref(false),
  error = ref("");
const cap = ref(pushCapability());
let requestId = 0,
  loadedToken = "",
  loadedAt = 0;
async function refresh() {
  const id = ++requestId;
  cap.value = pushCapability();
  error.value = "";
  loading.value = true;
  const token = props.token;
  try {
    const next = await getMemberPushConfig(token);
    if (id !== requestId || !props.modelValue || token !== props.token) return;
    const active = await syncMemberPush(token);
    if (id !== requestId || !props.modelValue || token !== props.token) return;
    loadedToken = token;
    loadedAt = Date.now();
    config.value = next;
    enabled.value = active;
  } catch (e) {
    if (id === requestId) error.value = (e as Error).message;
  } finally {
    if (id === requestId) loading.value = false;
  }
}
const removeNativeReady = onNativePushReady(() => {
  cap.value = pushCapability();
  if (props.modelValue && !busy.value) void refresh();
});
watch(
  () => [props.modelValue, props.token] as const,
  ([open, token], previous) => {
    ++requestId;
    busy.value = false;
    loading.value = false;
    if (previous && token !== previous[1]) {
      config.value = null;
      loadedToken = "";
      enabled.value = false;
    }
    if (
      open &&
      (!config.value || loadedToken !== token || Date.now() - loadedAt > 60000)
    )
      void refresh();
  },
  { immediate: true },
);
onUnmounted(() => {
  ++requestId;
  removeNativeReady();
});
async function enable() {
  if (busy.value || loading.value || !config.value) return;
  const id = requestId;
  loadedAt = 0; // An interrupted mutation must be reconciled on the next visit.
  busy.value = true;
  error.value = "";
  try {
    await enableMemberPush(props.token, config.value);
    if (id !== requestId) return;
    enabled.value = true;
    showToast("这台设备已开启通知");
  } catch (e) {
    if (id === requestId) error.value = (e as Error).message;
  } finally {
    if (id === requestId) busy.value = false;
  }
}
async function disable() {
  if (busy.value || loading.value) return;
  const id = requestId;
  loadedAt = 0; // An interrupted mutation must be reconciled on the next visit.
  busy.value = true;
  error.value = "";
  try {
    await disableMemberPush(props.token);
    if (id !== requestId) return;
    enabled.value = false;
    showToast("这台设备已关闭通知");
  } catch (e) {
    if (id === requestId) error.value = (e as Error).message;
  } finally {
    if (id === requestId) busy.value = false;
  }
}
async function test() {
  if (busy.value || loading.value) return;
  const id = requestId;
  busy.value = true;
  error.value = "";
  try {
    await testMemberPush(props.token);
    if (id !== requestId) return;
    showToast("测试已提交，请查看系统通知");
  } catch (e) {
    if (id === requestId) error.value = (e as Error).message;
  } finally {
    if (id === requestId) busy.value = false;
  }
}
</script>
<template>
  <ElasticSheet
    :model-value="modelValue"
    title="系统通知"
    @update:model-value="emit('update:modelValue', $event)"
    @closed="emit('closed')"
  >
    <SettingsSkeleton v-if="loading && !config" variant="notifications" />
    <div v-else class="push-settings" data-testid="push-settings">
      <p class="push-status">
        {{
          enabled
            ? "这台设备已开启"
            : !cap.native && !cap.supported && !cap.ios
              ? "此浏览器无法后台通知"
              : "接收室友提醒"
        }}
      </p>
      <p class="push-description">
        {{
          enabled
            ? `${nickname}的室友提醒已绑定这台设备。`
            : cap.native || cap.supported || cap.ios
              ? "开启后，室友提醒会出现在系统通知中。"
              : "站内提醒仍会直接弹出；关闭网页后，需要支持推送的浏览器或安装版。"
        }}
      </p>
      <template v-if="!cap.native && cap.ios && !cap.standalone">
        <p class="push-instruction">① Safari 分享 → 添加到主屏幕</p>
        <p class="push-instruction">② 从桌面图标打开，开启通知</p>
      </template>
      <p v-else-if="!cap.native && !cap.supported" class="push-instruction">
        安卓、鸿蒙安装版正在接入系统推送。也可换用支持 Web Push
        的浏览器后重新开启。
      </p>
      <template v-else>
        <button
          v-if="!enabled"
          class="guest-primary"
          data-testid="push-enable"
          :disabled="busy || loading || !config?.available"
          @click="enable"
        >
          {{ loading ? "正在检查…" : busy ? "正在开启…" : "开启系统通知" }}
        </button>
        <template v-else>
          <button
            class="guest-primary"
            data-testid="push-test"
            :disabled="busy || loading"
            @click="test"
          >
            发一条测试通知
          </button>
          <button
            class="push-disable"
            data-testid="push-disable"
            :disabled="busy || loading"
            @click="disable"
          >
            关闭这台设备的通知
          </button>
        </template>
      </template>
      <p v-if="config && !config.available" class="push-instruction">
        {{
          cap.native
            ? "安装版推送尚未配置，站内提醒仍可查看。"
            : "服务器通知暂不可用，站内提醒仍可查看。"
        }}
      </p>
      <p v-if="error" class="push-error" role="alert">{{ error }}</p>
      <TimedReminderSettings :active="modelValue" :token="token" />
      <CalendarSubscriptionSettings :active="modelValue" :token="token" />
      <details v-if="!cap.native && cap.ios" class="push-preview-help">
        <summary>通知没有正文？</summary>
        <p>
          iPhone 设置 → 通知 → 轮到 → 显示预览 →
          始终。勾选「通知中心」，再发一条测试通知。
        </p>
        <p>若选择「解锁时」，先解锁手机；长按通知可展开内容。</p>
      </details>
    </div>
  </ElasticSheet>
</template>
<style scoped>
.push-settings {
  animation: settings-content-enter var(--ui-release-time, 360ms)
    var(--ui-ease-out);
}
@keyframes settings-content-enter {
  from {
    opacity: 0;
    transform: translate3d(0, 6px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}
.push-status {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.3;
  margin: 0 0 16px;
}
.push-description,
.push-instruction,
.push-error {
  font-size: 16px;
  line-height: 1.6;
  margin: 0 0 20px;
  color: var(--app-tone-h555, #555);
}
.push-preview-help {
  margin-top: 20px;
  color: var(--app-tone-h555, #555);
  font-size: 16px;
  line-height: 1.6;
}
.push-preview-help summary {
  cursor: pointer;
  min-height: 44px;
  display: list-item;
  padding: 10px 0;
}
.push-preview-help p {
  margin: 8px 0 16px;
}
.push-settings .guest-primary {
  margin-top: 28px;
}
.push-disable {
  width: 100%;
  border: 0;
  background: none;
  font-size: 16px;
  min-height: 48px;
  color: var(--app-tone-h555, #555);
  margin-top: 12px;
}
.push-error {
  margin-top: 20px;
  color: var(--app-tone-h111, #111);
}
</style>
