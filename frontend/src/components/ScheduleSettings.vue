<script setup lang="ts">
import { confirmInSheet } from "../interactions/confirm";
import { ref, computed, watch, onUnmounted } from "vue";
import { showToast } from "vant";
import { api, patch } from "../api";
import { currentDay, shiftDay } from "../api/date";
import type { Dorm, ScheduleRules, PreviewDay } from "../api/types";
const props = defineProps<{ dorm: Dorm }>();
const emit = defineEmits<{ saved: [] }>();
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const name = ref(""),
  task = ref(""),
  deadline = ref("22:00"),
  anchor = ref("");
const order = ref<number[]>([]),
  rules = ref<ScheduleRules>({
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    rotation_days: 1,
    horizon_days: 30,
    skip_dates: [],
    weekly_tasks: {},
  });
const skipDate = ref(""),
  busy = ref(false),
  error = ref(""),
  preview = ref<PreviewDay[]>([]),
  previewError = ref(""),
  previewBusy = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined,
  requestId = 0;
const previewStart = computed(() => shiftDay(currentDay(), 1));
const payload = computed(() => ({
  name: name.value,
  task_text: task.value,
  deadline_time: deadline.value,
  rotation_order: order.value,
  rotation_start_date: anchor.value,
  schedule_rules: rules.value,
}));
function reset() {
  name.value = props.dorm.name;
  task.value = props.dorm.task_text;
  deadline.value = props.dorm.deadline_time;
  anchor.value = props.dorm.rotation_start_date;
  order.value = [...props.dorm.rotation_order];
  rules.value = JSON.parse(JSON.stringify(props.dorm.schedule_rules));
  error.value = "";
}
watch(() => props.dorm.id, reset, { immediate: true });
const valid = computed(
  () =>
    name.value.trim() &&
    task.value.trim() &&
    anchor.value &&
    deadline.value &&
    rules.value.weekdays.length > 0,
);
watch(
  payload,
  () => {
    clearTimeout(timer);
    const id = ++requestId;
    previewBusy.value = true;
    timer = setTimeout(async () => {
      if (!valid.value) {
        previewError.value =
          "请填写默认任务、时间和起始日期，并至少选择一个值日星期。";
        previewBusy.value = false;
        return;
      }
      try {
        const { name: _name, ...draft } = payload.value;
        const result = await api<{ items: PreviewDay[] }>("/duties/preview", {
          method: "POST",
          body: JSON.stringify({
            ...draft,
            start_date: previewStart.value,
            days: 7,
          }),
        });
        if (id === requestId) {
          preview.value = result.items;
          previewError.value = "";
        }
      } catch (e) {
        if (id === requestId) previewError.value = (e as Error).message;
      } finally {
        if (id === requestId) previewBusy.value = false;
      }
    }, 350);
  },
  { deep: true, immediate: true },
);
onUnmounted(() => {
  clearTimeout(timer);
  requestId++;
});
function toggle(day: number) {
  if (busy.value) return;
  rules.value.weekdays = rules.value.weekdays.includes(day)
    ? rules.value.weekdays.filter((d) => d !== day)
    : [...rules.value.weekdays, day].sort();
}
function move(index: number, step: number) {
  const next = index + step;
  if (next < 0 || next >= order.value.length) return;
  const a = [...order.value];
  [a[index], a[next]] = [a[next]!, a[index]!];
  order.value = a;
}
function setWeekly(
  day: number,
  key: "task_text" | "deadline_time",
  value: string,
) {
  const templates = { ...rules.value.weekly_tasks },
    template = { ...templates[String(day)] };
  if (value.trim()) template[key] = value;
  else delete template[key];
  if (Object.keys(template).length) templates[String(day)] = template;
  else delete templates[String(day)];
  rules.value.weekly_tasks = templates;
}
function addSkip() {
  if (!skipDate.value) return;
  if (skipDate.value <= currentDay()) {
    showToast("休息日期请选择明天或之后");
    return;
  }
  rules.value.skip_dates = [
    ...new Set([...rules.value.skip_dates, skipDate.value]),
  ].sort();
  skipDate.value = "";
}
async function save() {
  if (!valid.value) {
    error.value = "请补全配置，并至少选择一个值日星期。";
    return;
  }
  try {
    await confirmInSheet({
      title: "应用新的排班规则？",
      message:
        "将更新明天起的未完成排班，包括手工调整。今天、过去及已完成记录会保留。请先确认下方预览。",
    });
  } catch {
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const result = await patch<
      Dorm & { effect: { added: number; updated: number; removed: number } }
    >("/dorms/current", {
      ...payload.value,
      expected_version: props.dorm.schedule_version,
    });
    showToast(
      `已保存 · 更新 ${result.effect?.updated || 0} 天，新增 ${result.effect?.added || 0} 天`,
    );
    emit("saved");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
const memberName = (uid: number) =>
  props.dorm.members.find((m) => m.user_id === uid)?.nickname || "室友";
</script>
<template>
  <section class="settings-section">
    <div class="section-title">
      <h2>按你们的习惯排班</h2>
      <span class="admin-label"><van-icon name="setting-o" /> 管理员</span>
    </div>
    <p class="settings-intro">轮换节奏、卫生内容、休息日，都由你们决定。</p>
    <fieldset :disabled="busy" class="settings-fieldset">
      <div class="settings-block">
        <div class="settings-block-heading">
          <span class="step-icon"><van-icon name="todo-list-o" /></span>
          <div>
            <h3>日常任务</h3>
            <p>所有值日日期的默认安排</p>
          </div>
        </div>
        <label class="control-label"
          >宿舍名称<input
            v-model="name"
            maxlength="64"
            placeholder="例如 6-402"
        /></label>
        <label class="control-label"
          >默认值日内容<textarea
            v-model="task"
            rows="3"
            maxlength="200"
            placeholder="每行一个任务，例如扫地、拖地、倒垃圾"
          ></textarea>
        </label>
        <div class="field-pair">
          <label class="control-label"
            >默认截止时间<input v-model="deadline" type="time" /></label
          ><label class="control-label"
            >排班范围<select
              v-model.number="rules.horizon_days"
              aria-label="排班范围"
            >
              <option
                v-for="days in [7, 14, 30, 60, 90]"
                :key="days"
                :value="days"
              >
                未来 {{ days }} 天
              </option>
            </select></label
          >
        </div>
      </div>
      <div class="settings-block">
        <div class="settings-block-heading">
          <span class="step-icon"><van-icon name="exchange" /></span>
          <div>
            <h3>轮换节奏</h3>
            <p>休息日不占轮换名额</p>
          </div>
        </div>
        <div class="field-pair">
          <label class="control-label"
            >第一位成员开始日期<input v-model="anchor" type="date" /></label
          ><label class="control-label"
            >连续负责<select
              v-model.number="rules.rotation_days"
              aria-label="连续负责"
            >
              <option v-for="days in 14" :key="days" :value="days">
                {{ days }} 个值日日期
              </option>
            </select></label
          >
        </div>
        <span class="control-label">每周哪些天值日</span>
        <div class="weekday-picker">
          <button
            v-for="(w, i) in weekdays"
            :key="w"
            type="button"
            :aria-label="`星期${w}值日`"
            :aria-pressed="rules.weekdays.includes(i + 1)"
            :class="{ selected: rules.weekdays.includes(i + 1) }"
            @click="toggle(i + 1)"
          >
            {{ w }}
          </button>
        </div>
        <p class="helper">
          例如只选一到五、连续负责 2 个值日日期：周末休息，轮换在周一接着继续。
        </p>
        <div class="rotation-list">
          <div v-for="(uid, i) in order" :key="uid" class="order-row">
            <span class="order-index">{{ String(i + 1).padStart(2, "0") }}</span
            ><strong>{{ memberName(uid) }}</strong
            ><button
              type="button"
              :disabled="i === 0"
              :aria-label="`${memberName(uid)}上移`"
              @click="move(i, -1)"
            >
              <van-icon name="arrow-up" /></button
            ><button
              type="button"
              :disabled="i === order.length - 1"
              :aria-label="`${memberName(uid)}下移`"
              @click="move(i, 1)"
            >
              <van-icon name="arrow-down" />
            </button>
          </div>
        </div>
      </div>
      <details class="settings-block template-block">
        <summary>
          <span class="step-icon"><van-icon name="calendar-o" /></span>
          <div>
            <h3>按星期安排不同任务</h3>
            <p>比如周日大扫除，其他日期日常清洁</p>
          </div>
          <van-icon name="arrow-down" />
        </summary>
        <div class="template-list">
          <div v-for="(w, i) in weekdays" :key="w" class="weekday-template">
            <h4>
              星期{{ w
              }}<span>{{
                rules.weekdays.includes(i + 1) ? "值日" : "休息"
              }}</span>
            </h4>
            <label class="control-label"
              >当天任务<textarea
                :value="rules.weekly_tasks[String(i + 1)]?.task_text || ''"
                :placeholder="`沿用默认：${task}`"
                rows="2"
                maxlength="200"
                @input="
                  setWeekly(
                    i + 1,
                    'task_text',
                    ($event.target as HTMLTextAreaElement).value,
                  )
                "
              ></textarea></label
            ><label class="control-label"
              >当天截止时间<input
                type="time"
                :value="rules.weekly_tasks[String(i + 1)]?.deadline_time || ''"
                @input="
                  setWeekly(
                    i + 1,
                    'deadline_time',
                    ($event.target as HTMLInputElement).value,
                  )
                "
            /></label>
            <p class="helper">留空沿用默认内容与 {{ deadline }} 截止时间。</p>
          </div>
        </div>
      </details>
      <details class="settings-block">
        <summary>
          <span class="step-icon"><van-icon name="pause-circle-o" /></span>
          <div>
            <h3>指定休息日期</h3>
            <p>假期、考试日或宿舍共同休息</p>
          </div>
          <van-icon name="arrow-down" />
        </summary>
        <div class="skip-controls">
          <label class="control-label"
            >休息日期<input
              type="date"
              v-model="skipDate"
              :min="previewStart" /></label
          ><button
            class="soft-button"
            type="button"
            @click="addSkip"
            :disabled="!skipDate || rules.skip_dates.length >= 180"
          >
            添加
          </button>
        </div>
        <div class="skip-chips">
          <button
            v-for="day in rules.skip_dates"
            :key="day"
            type="button"
            :aria-label="`移除休息日期${day}`"
            @click="
              rules.skip_dates = rules.skip_dates.filter((d) => d !== day)
            "
          >
            {{ day }}<van-icon name="cross" />
          </button>
        </div>
        <p v-if="!rules.skip_dates.length" class="helper">
          还没有指定休息日期。
        </p>
      </details>
    </fieldset>
    <div class="preview-card" aria-live="polite" :aria-busy="previewBusy">
      <header>
        <h3>未来一周预览</h3>
        <span>{{ previewBusy ? "正在更新" : "从明天开始" }}</span>
      </header>
      <p class="helper">这是新规则的效果，保存后才会应用。</p>
      <p v-if="previewError" class="error-text">{{ previewError }}</p>
      <div v-else class="preview-days" :class="{ updating: previewBusy }">
        <div v-for="day in preview" :key="day.duty_date" class="preview-day">
          <span>{{ day.duty_date.slice(5).replace("-", "/") }}</span
          ><strong>{{ day.task?.assignee_name || "休息" }}</strong
          ><small>{{ day.task?.task_text || "不占轮换名额" }}</small
          ><span v-if="day.task" class="preview-clock"
            >{{
              new Date(day.task.deadline_at).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Shanghai",
              })
            }}
            截止</span
          >
        </div>
      </div>
    </div>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <van-button
      block
      type="primary"
      class="spaced save-rules-button"
      :loading="busy"
      :disabled="previewBusy || !valid || !!previewError"
      aria-label="保存规则并更新未来排班"
      @click="save"
      ><van-icon name="passed" /> 保存规则并更新未来排班</van-button
    >
    <button
      type="button"
      class="text-button reset-rules"
      :disabled="busy"
      @click="reset"
    >
      还原为已保存的设置
    </button>
  </section>
</template>
