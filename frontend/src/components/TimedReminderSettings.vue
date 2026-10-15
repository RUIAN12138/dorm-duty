<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { showToast } from "vant";
import {
  getReminderPlan,
  saveReminderPlan,
  type ReminderPlan,
} from "../api/reminderPlan";
import { ApiError } from "../api";
const props = defineProps<{ active: boolean; token: string }>();
const expanded = ref(false),
  loading = ref(false),
  saving = ref(false),
  error = ref("");
const plan = ref<ReminderPlan | null>(null),
  enabled = ref(false),
  times = ref<string[]>([]);
let requestId = 0,
  controller: AbortController | undefined;
const delivery = computed(() => {
  const last = plan.value?.last_reminder;
  if (!last) return "";
  if (last.pending) return "最近提醒的推送正在排队";
  if (last.failed) return "最近提醒有推送未成功";
  if (last.accepted) return "最近提醒已被推送服务接受";
  return "最近已生成站内提醒";
});
function accept(value: ReminderPlan) {
  plan.value = value;
  enabled.value = value.enabled;
  times.value = [...value.times];
}
async function load() {
  controller?.abort();
  const current = new AbortController();
  controller = current;
  const id = ++requestId,
    token = props.token;
  loading.value = true;
  error.value = "";
  try {
    const result = await getReminderPlan(token, current.signal);
    if (id === requestId && props.active && token === props.token)
      accept(result);
  } catch (e) {
    if (id === requestId && !current.signal.aborted)
      error.value = (e as Error).message;
  } finally {
    if (id === requestId) loading.value = false;
  }
}
function toggle(event: Event) {
  expanded.value = (event.target as HTMLDetailsElement).open;
  if (expanded.value && props.active && !plan.value && !loading.value)
    void load();
}
function addTime() {
  const next = ["08:00", "19:00", "21:00"].find(
    (value) => !times.value.includes(value),
  );
  if (next && times.value.length < 3) times.value.push(next);
}
async function save() {
  if (saving.value || loading.value || !plan.value) return;
  const id = ++requestId,
    token = props.token,
    current = new AbortController();
  controller = current;
  saving.value = true;
  error.value = "";
  try {
    const result = await saveReminderPlan(
      token,
      {
        enabled: enabled.value,
        times: [...times.value],
        version: plan.value.version,
      },
      current.signal,
    );
    if (id !== requestId || !props.active || token !== props.token) return;
    accept(result);
    showToast(result.enabled ? "定时提醒已保存" : "定时提醒已关闭");
  } catch (e) {
    if (id !== requestId || current.signal.aborted) return;
    error.value =
      e instanceof ApiError && e.status === 409
        ? "提醒设置已变化，请重新读取后再保存。"
        : (e as Error).message;
  } finally {
    if (id === requestId) saving.value = false;
  }
}
watch(
  () => [props.active, props.token] as const,
  ([active]) => {
    ++requestId;
    controller?.abort();
    if (active) {
      expanded.value = false;
      plan.value = null;
      loading.value = false;
      saving.value = false;
      error.value = "";
    }
  },
);
onUnmounted(() => {
  ++requestId;
  controller?.abort();
});
</script>
<template>
  <details
    :open="expanded"
    class="timed-reminders"
    data-testid="timed-reminders"
    @toggle="toggle"
  >
    <summary>定时提醒</summary>
    <p v-if="loading" role="status">正在读取…</p>
    <form v-else-if="plan" @submit.prevent="save">
      <fieldset :disabled="saving">
        <label class="plan-toggle"
          ><span>每天提醒我</span
          ><input
            v-model="enabled"
            type="checkbox"
            data-testid="reminder-plan-enabled"
        /></label>
        <div v-if="enabled" class="plan-times">
          <label v-for="(_, index) in times" :key="index" class="plan-time"
            ><span>时间 {{ index + 1 }}</span>
            <input
              v-model="times[index]"
              type="time"
              required
              :aria-label="`提醒时间 ${index + 1}`"
            />
            <button
              v-if="times.length > 1"
              type="button"
              :aria-label="`删除提醒时间 ${index + 1}`"
              @click="times.splice(index, 1)"
            >
              删除
            </button>
          </label>
          <button
            v-if="times.length < 3"
            type="button"
            class="plan-add"
            @click="addTime"
          >
            加一个时间
          </button>
          <p>北京时间。只提醒未完成的值日任务。</p>
        </div>
        <button
          type="submit"
          class="guest-primary"
          data-testid="reminder-plan-save"
        >
          {{ saving ? "正在保存…" : "保存设置" }}
        </button>
      </fieldset>
      <p v-if="enabled">要收到系统通知，还需开启这台设备的通知。</p>
      <p v-if="delivery" role="status">{{ delivery }}</p>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <button
      v-if="error"
      type="button"
      class="plan-add"
      :disabled="loading || saving"
      @click="load"
    >
      重新读取
    </button>
  </details>
</template>
<style scoped>
.timed-reminders {
  margin-top: 24px;
  border-top: 1px solid #eee;
  font-size: 16px;
  line-height: 1.5;
}
summary {
  min-height: 48px;
  padding: 14px 0;
  cursor: pointer;
}
fieldset {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.plan-toggle,
.plan-time {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
}
.plan-toggle input {
  width: 22px;
  height: 22px;
  accent-color: #111;
}
.plan-time input {
  min-width: 0;
  width: 112px;
  padding: 10px 8px;
  border: 1px solid #ddd;
  border-radius: 10px;
  font: inherit;
  background: #fff;
  color: #111;
}
.plan-time button,
.plan-add {
  border: 0;
  background: none;
  color: #555;
  font: inherit;
  padding: 10px 0;
  min-height: 44px;
}
p {
  margin: 12px 0;
  color: #555;
}
.guest-primary {
  margin-top: 16px;
}
button {
  transition: transform 160ms ease-out;
}
button:active {
  transform: scale(0.97);
}
</style>
