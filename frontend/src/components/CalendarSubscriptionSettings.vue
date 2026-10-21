<script setup lang="ts">
import { confirmInSheet } from "../interactions/confirm";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { showToast } from "vant";
import { ApiError } from "../api";
import { appPath } from "../api/path";
import {
  createCalendarSubscription,
  getCalendarSubscription,
  revokeCalendarSubscription,
  updateCalendarSubscription,
  type CalendarSubscription,
} from "../api/calendarSubscription";
const props = defineProps<{ active: boolean; token: string }>();
const expanded = ref(false),
  busy = ref(false),
  error = ref(""),
  alarms = ref(false),
  address = ref(""),
  revealed = ref(false);
const config = ref<CalendarSubscription | null>(null);
const alarmsChanged = computed(() =>
  Boolean(
    config.value?.enabled && alarms.value !== config.value.include_alarms,
  ),
);
let epoch = 0,
  controller: AbortController | undefined;
const calendarLink = computed(() =>
  address.value.startsWith("https:")
    ? address.value.replace(/^https:/, "webcal:")
    : "",
);
function clear() {
  ++epoch;
  controller?.abort();
  address.value = "";
  revealed.value = false;
  busy.value = false;
}
function accept(value: CalendarSubscription) {
  config.value = value;
  alarms.value = value.include_alarms;
  if (value.path && /^\/chores\/calendar\/[a-f0-9]{64}\.ics$/.test(value.path))
    address.value = new URL(appPath(value.path), window.location.origin).href;
}
async function run(action: "load" | "create" | "save" | "revoke") {
  if (busy.value || !props.active) return;
  const id = ++epoch,
    token = props.token;
  if (action !== "load" && !config.value) return;
  busy.value = true;
  if (["create", "revoke"].includes(action) && config.value?.enabled) {
    try {
      await confirmInSheet({
        title: action === "revoke" ? "撤销日历订阅？" : "更换订阅地址？",
        message: "旧地址将失效。已同步的日程请在系统日历中移除。",
        confirmButtonText: action === "revoke" ? "撤销订阅" : "更换地址",
      });
    } catch {
      if (id === epoch) busy.value = false;
      return;
    }
    if (id !== epoch || !props.active || token !== props.token) return;
  }
  busy.value = true;
  error.value = "";
  controller?.abort();
  const current = new AbortController();
  controller = current;
  try {
    const value =
      action === "load"
        ? await getCalendarSubscription(token, current.signal)
        : action === "create"
          ? await createCalendarSubscription(
              token,
              config.value!.version,
              alarms.value,
              current.signal,
            )
          : action === "save"
            ? await updateCalendarSubscription(
                token,
                config.value!.version,
                alarms.value,
                current.signal,
              )
            : await revokeCalendarSubscription(
                token,
                config.value!.version,
                current.signal,
              );
    if (id !== epoch || !props.active || token !== props.token) return;
    if (action !== "save") {
      address.value = "";
      revealed.value = false;
    }
    accept(value);
    if (action !== "load")
      showToast(
        action === "create"
          ? "订阅地址已生成"
          : action === "save"
            ? "日历提醒设置已保存"
            : "日历订阅已撤销",
      );
  } catch (e) {
    if (id === epoch && !current.signal.aborted)
      error.value =
        e instanceof ApiError && e.status === 409
          ? "订阅设置已变化，请重新读取。"
          : (e as Error).message;
  } finally {
    if (id === epoch) busy.value = false;
  }
}
function toggle(event: Event) {
  expanded.value = (event.target as HTMLDetailsElement).open;
  if (expanded.value && !config.value && props.active) void run("load");
}
async function copy() {
  if (!address.value || !props.active) return;
  const id = epoch,
    value = address.value;
  try {
    await navigator.clipboard.writeText(value);
    if (id === epoch && props.active) showToast("订阅地址已复制");
  } catch {
    if (id === epoch && props.active) {
      revealed.value = true;
      showToast("请长按地址复制");
    }
  }
}
watch(
  () => [props.active, props.token] as const,
  ([active, token], previous) => {
    const interrupted = busy.value;
    clear();
    if (interrupted) config.value = null;
    if (previous && token !== previous[1]) {
      config.value = null;
      expanded.value = false;
      error.value = "";
    }
    if (active && config.value) accept(config.value);
    else if (active && expanded.value) void run("load");
  },
);
onBeforeUnmount(clear);
</script>
<template>
  <details
    class="calendar-settings"
    :open="expanded"
    @toggle="toggle"
    data-testid="calendar-subscription"
  >
    <summary>日历订阅</summary>
    <p v-if="busy && !config" role="status">正在读取…</p>
    <template v-if="config">
      <p>将自己的值日放进系统日历。</p>
      <label class="calendar-toggle"
        ><span>沿用定时提醒</span
        ><input v-model="alarms" type="checkbox" :disabled="busy"
      /></label>
      <button
        v-if="alarmsChanged"
        type="button"
        class="guest-primary"
        :disabled="busy"
        @click="run('save')"
      >
        {{ busy ? "正在保存…" : "保存提醒设置" }}
      </button>
      <div v-if="address" class="calendar-address">
        <button type="button" class="guest-primary" @click="copy">
          复制订阅地址
        </button>
        <a
          v-if="calendarLink"
          :href="calendarLink"
          rel="noreferrer"
          class="calendar-link"
          >添加到日历</a
        >
        <button
          type="button"
          class="calendar-link"
          @click="revealed = !revealed"
        >
          {{ revealed ? "收起地址" : "显示地址" }}
        </button>
        <textarea
          v-if="revealed"
          :value="address"
          readonly
          rows="3"
          aria-label="私人日历订阅地址"
          spellcheck="false"
          autocapitalize="off"
        />
        <p>地址仅在本次显示，请勿转发。</p>
      </div>
      <button
        v-else
        type="button"
        class="guest-primary"
        :disabled="busy"
        @click="run('create')"
      >
        {{
          busy
            ? "正在处理…"
            : config.enabled
              ? "重新生成订阅地址"
              : "生成订阅地址"
        }}
      </button>
      <button
        v-if="config.enabled"
        type="button"
        class="calendar-link"
        :disabled="busy"
        @click="run('revoke')"
      >
        撤销日历订阅
      </button>
      <p class="calendar-note">
        日历自行同步，打卡后可能延迟更新。抬水催促仍使用系统通知。
      </p>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <button
      v-if="error"
      type="button"
      class="calendar-link"
      :disabled="busy"
      @click="run('load')"
    >
      重新读取
    </button>
  </details>
</template>
<style scoped>
.calendar-settings {
  margin-top: 16px;
  border-top: 1px solid var(--app-tone-heee, #eee);
  font-size: 16px;
  line-height: 1.5;
}
summary {
  min-height: 48px;
  padding: 14px 0;
  cursor: pointer;
}
p {
  margin: 8px 0 16px;
  color: var(--app-tone-h555, #555);
}
.calendar-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  gap: 12px;
  margin-bottom: 12px;
}
input {
  width: 22px;
  height: 22px;
  accent-color: var(--app-tone-h111, #111);
  flex-shrink: 0;
}
.calendar-link {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 12px 0;
  border: 0;
  background: transparent;
  color: var(--app-tone-h333, #333);
  text-align: center;
  text-decoration: underline;
  text-underline-offset: 4px;
  cursor: pointer;
  font-size: 16px;
}
.calendar-link:disabled {
  opacity: 0.4;
  cursor: default;
}
.calendar-note {
  font-size: 14px;
}
textarea {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--app-tone-hddd, #ddd);
  border-radius: 10px;
  background: var(--app-tone-hfafafa, #fafafa);
  color: var(--app-tone-h111, #111);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  resize: none;
}
[role="alert"] {
  color: var(--app-tone-h444, #444);
  border-left: 2px solid var(--app-tone-h111, #111);
  padding-left: 12px;
}
</style>
