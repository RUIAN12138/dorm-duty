<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute } from "vue-router";
import { showToast, showConfirmDialog } from "vant";
import { api, post, patch, query } from "../api";
import { shiftDay, currentDay } from "../api/date";
import type { Duty, Today, Page } from "../api/types";
import { useSession } from "../stores/session";
import { useLoad } from "../components/useLoad";
import StatusBadge from "../components/StatusBadge.vue";
import EmptyState from "../components/EmptyState.vue";
import ElasticSheet from "../components/ElasticSheet.vue";
const editText = ref(""),
  editDeadline = ref("22:00"),
  editUser = ref(0),
  editError = ref("");
const origin = ref<DOMRect | null>(null),
  generator = ref(false),
  generationStart = ref(""),
  generationDays = ref(30),
  replaceFuture = ref(false);
function openEditor(event: Event) {
  origin.value = (event.currentTarget as HTMLElement).getBoundingClientRect();
  editText.value = chosen.value?.task_text || session.dorm!.task_text;
  editUser.value =
    chosen.value?.assignee_id || session.dorm!.rotation_order[0]!;
  editDeadline.value = chosen.value
    ? new Date(chosen.value.deadline_at).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Shanghai",
      })
    : session.dorm!.deadline_time;
  editError.value = "";
  choose.value = true;
}
function openGenerator(event: Event) {
  origin.value = (event.currentTarget as HTMLElement).getBoundingClientRect();
  generationStart.value =
    selected.value < today.value ? today.value : selected.value;
  generationDays.value = session.dorm!.schedule_rules.horizon_days;
  replaceFuture.value = false;
  editError.value = "";
  generator.value = true;
}
const route = useRoute();
const requestedDay = String(route.query.date || "");
const initialDay =
  /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) &&
  !Number.isNaN(Date.parse(requestedDay + "T12:00:00Z"))
    ? requestedDay
    : currentDay();
const session = useSession(),
  mode = ref("month"),
  selected = ref(initialDay),
  today = ref(currentDay()),
  tasks = ref<Duty[]>([]),
  busy = ref(false),
  choose = ref(false);
const range = computed(() => {
  const d = new Date(selected.value + "T12:00:00Z");
  if (mode.value === "week") {
    const first = shiftDay(selected.value, -((d.getUTCDay() + 6) % 7));
    return { start: first, end: shiftDay(first, 6) };
  }
  const first = selected.value.slice(0, 7) + "-01";
  const lead = (new Date(first + "T12:00:00Z").getUTCDay() + 6) % 7;
  return { start: shiftDay(first, -lead), end: shiftDay(first, 41 - lead) };
});
const days = computed(() =>
  Array.from({ length: mode.value === "month" ? 42 : 7 }, (_, i) =>
    shiftDay(range.value.start, i),
  ),
);
const byDay = computed(() => new Map(tasks.value.map((t) => [t.duty_date, t])));
const chosen = computed(() => byDay.value.get(selected.value));
const { loading, error, refresh } = useLoad(async () => {
  await session.refresh();
  if (!session.dorm) return;
  today.value = (await api<Today>("/duties/today")).today;
  tasks.value = (
    await api<Page<Duty>>(
      "/duties?" +
        query({
          start_date: range.value.start,
          end_date: range.value.end,
          page_size: 100,
        }),
    )
  ).items;
});
async function navigate(step: number) {
  if (mode.value === "week")
    selected.value = shiftDay(selected.value, 7 * step);
  else {
    const d = new Date(selected.value.slice(0, 7) + "-01T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + step);
    selected.value = d.toISOString().slice(0, 10);
  }
  await refresh();
}
async function switchMode(next: string) {
  mode.value = next;
  await refresh();
}
async function select(day: string) {
  const old = range.value.start;
  selected.value = day;
  if (range.value.start !== old) await refresh();
}
async function generate() {
  const replace = replaceFuture.value;
  if (replace && generationStart.value <= today.value) {
    editError.value = "重排请从明天或之后开始。";
    return;
  }
  const offset = Math.round(
    (Date.parse(generationStart.value + "T12:00:00Z") -
      Date.parse(today.value + "T12:00:00Z")) /
      86400000,
  );
  if (offset < 0 || offset + Number(generationDays.value) > 90) {
    editError.value = "生成范围需在今天至未来 90 天内。";
    return;
  }
  try {
    if (replace)
      await showConfirmDialog({
        title: "重新安排选定日期？",
        message: "将覆盖范围内未完成的手工安排，已完成记录保留。",
      });
    busy.value = true;
    editError.value = "";
    await post(replace ? "/duties/regenerate" : "/duties/generate", {
      start_date: generationStart.value,
      days: Number(generationDays.value),
      expected_version: session.dorm!.schedule_version,
    });
    showToast(replace ? "选定范围已重排" : "选定范围已补齐");
    generator.value = false;
    await refresh();
  } catch (e) {
    if (e instanceof Error) editError.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function saveDay() {
  if (!editText.value.trim() || !editDeadline.value) {
    editError.value = "请填写值日内容和截止时间。";
    return;
  }
  busy.value = true;
  editError.value = "";
  const body = {
    assignee_id: editUser.value,
    task_text: editText.value,
    deadline_time: editDeadline.value,
    expected_version: session.dorm!.schedule_version,
  };
  try {
    if (chosen.value) await patch(`/duties/${chosen.value.id}`, body);
    else await post("/duties/custom", { ...body, duty_date: selected.value });
    showToast("这一天的安排已保存");
    choose.value = false;
    await refresh();
  } catch (e) {
    editError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <main class="page">
    <div class="section-heading">
      <span class="eyebrow">EVERYONE HAS A TURN</span>
      <h1>值日排班</h1>
      <p>每一天，都有人认真照顾。</p>
    </div>
    <div v-if="error" class="error-panel">
      {{ error }}<van-button size="small" @click="refresh">重试</van-button>
    </div>
    <EmptyState
      v-if="!session.dorm && !loading"
      title="先和室友集合"
      text="加入宿舍后即可查看共同排班。"
      ><router-link to="/dorm"
        ><van-button type="primary">创建或加入宿舍</van-button></router-link
      ></EmptyState
    >
    <template v-if="session.dorm"
      ><div class="calendar-controls">
        <div class="segmented compact">
          <button
            :class="{ active: mode === 'week' }"
            @click="switchMode('week')"
          >
            周</button
          ><button
            :class="{ active: mode === 'month' }"
            @click="switchMode('month')"
          >
            月
          </button>
        </div>
        <button
          class="text-button"
          @click="
            selected = today;
            refresh();
          "
        >
          回到今天
        </button>
      </div>
      <div class="calendar-card">
        <div class="calendar-title">
          <button aria-label="上一页" @click="navigate(-1)">
            <van-icon aria-hidden="true" name="arrow-left" /></button
          ><strong
            >{{ selected.slice(0, 4) }} 年
            {{ Number(selected.slice(5, 7)) }} 月</strong
          ><button aria-label="下一页" @click="navigate(1)">
            <van-icon aria-hidden="true" name="arrow" />
          </button>
        </div>
        <div class="calendar-grid weekdays">
          <span
            v-for="w in ['一', '二', '三', '四', '五', '六', '日']"
            :key="w"
            >{{ w }}</span
          >
        </div>
        <div class="calendar-grid">
          <button
            v-for="day in days"
            :key="day"
            :class="{
              chosen: day === selected,
              today: day === today,
              muted:
                mode === 'month' && day.slice(0, 7) !== selected.slice(0, 7),
            }"
            @click="select(day)"
            :aria-label="`${day} ${byDay.get(day)?.assignee_name_snapshot || '无排班'}`"
          >
            <span>{{ Number(day.slice(8)) }}</span
            ><small>{{
              byDay.get(day)?.assignee_name_snapshot.slice(0, 3) || "未安排"
            }}</small
            ><i
              v-if="byDay.get(day)?.status === 'completed'"
              class="completed-dot"
            ></i>
          </button>
        </div>
      </div>
      <van-loading v-if="loading" class="page-loading" />
      <div class="section-title">
        <h2>
          {{
            selected === today
              ? "今天"
              : selected.slice(5).replace("-", "月") + "日"
          }}的安排
        </h2>
        <StatusBadge v-if="chosen" :status="chosen.display_status" />
      </div>
      <Transition name="day-detail" mode="out-in"
        ><div v-if="chosen" :key="chosen.id" class="detail-card">
          <h3>{{ chosen.assignee_name_snapshot }}</h3>
          <p>{{ chosen.task_text }}</p>
          <span class="subtle"
            >{{ chosen.is_override ? "管理员指定 · " : "" }}截止
            {{
              new Date(chosen.deadline_at).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Shanghai",
              })
            }}</span
          ><van-button
            v-if="
              session.dorm.is_admin &&
              chosen.status === 'pending' &&
              selected >= today
            "
            block
            plain
            type="primary"
            class="spaced"
            :disabled="busy"
            @click="openEditor"
            >自定义这一天</van-button
          >
        </div>
        <div v-else :key="selected" class="rest-day">
          <span class="rest-icon"><van-icon name="smile-o" /></span>
          <h3>这天没有值日安排</h3>
          <p>可以休息，也可以临时添加一项任务。</p>
          <van-button
            v-if="session.dorm.is_admin && selected >= today"
            plain
            type="primary"
            class="spaced"
            @click="openEditor"
            >添加这一天的安排</van-button
          >
        </div></Transition
      >
      <template v-if="session.dorm.is_admin">
        <van-button
          block
          type="primary"
          class="spaced"
          :disabled="busy"
          aria-label="生成 / 补齐排班"
          @click="openGenerator"
          ><van-icon name="calendar-o" /> 生成 / 补齐排班</van-button
        >
        <router-link to="/dorm?settings=1" class="schedule-settings-link"
          ><van-icon name="setting-o" /> 自定义轮换规则与值日内容<van-icon
            name="arrow"
        /></router-link>
      </template>
      <ElasticSheet
        v-model="choose"
        :title="`${selected.slice(5).replace('-', '月')}日的自定义安排`"
        :origin="origin"
      >
        <form @submit.prevent="saveDay" class="day-editor">
          <fieldset :disabled="busy" class="settings-fieldset">
            <label class="control-label"
              >值日成员<select v-model.number="editUser" aria-label="值日成员">
                <option
                  v-for="m in session.dorm.members"
                  :key="m.user_id"
                  :value="m.user_id"
                >
                  {{ m.nickname }}
                </option>
              </select></label
            ><label class="control-label"
              >这一天的值日内容<textarea
                v-model="editText"
                rows="4"
                maxlength="200"
                placeholder="输入具体的卫生任务"
              ></textarea></label
            ><label class="control-label"
              >这一天的截止时间<input v-model="editDeadline" type="time"
            /></label>
          </fieldset>
          <p class="helper">只修改这一天。已完成和过去的排班不能修改。</p>
          <p v-if="editError" class="error-text" role="alert">
            {{ editError }}
          </p>
          <van-button block type="primary" native-type="submit" :loading="busy"
            >保存这一天的安排</van-button
          >
        </form>
      </ElasticSheet>
      <ElasticSheet v-model="generator" title="生成一段排班" :origin="origin">
        <form @submit.prevent="generate">
          <fieldset :disabled="busy" class="settings-fieldset">
            <div class="field-pair">
              <label class="control-label"
                >开始日期<input
                  v-model="generationStart"
                  type="date"
                  :min="today" /></label
              ><label class="control-label"
                >安排天数<input
                  v-model.number="generationDays"
                  type="number"
                  min="1"
                  max="90"
              /></label>
            </div>
            <label class="switch-setting"
              ><span
                ><strong>重新安排已有任务</strong
                ><small>关闭时只补齐空缺；开启时覆盖未完成安排</small></span
              ><van-switch v-model="replaceFuture" size="24"
            /></label>
          </fieldset>
          <p class="helper">
            每周值日日期、休息日和任务模板将按已保存的规则应用。
          </p>
          <p v-if="editError" class="error-text" role="alert">
            {{ editError }}
          </p>
          <van-button
            block
            type="primary"
            native-type="submit"
            :loading="busy"
            >{{ replaceFuture ? "确认重排" : "生成并补齐" }}</van-button
          >
        </form>
      </ElasticSheet>
    </template>
  </main>
</template>
