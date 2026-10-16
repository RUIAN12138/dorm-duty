<script setup lang="ts">
import { ref, onActivated, computed } from "vue";
import { showToast } from "../interaction/notice";
import { useSession } from "../stores/session";
import { api, patch, post } from "../api";
import type { Today } from "../api/types";
import { useLoad } from "../components/useLoad";
import DutyRow from "../components/DutyRow.vue";
import EmptyState from "../components/EmptyState.vue";
import StatusBadge from "../components/StatusBadge.vue";
import ElasticSheet from "../components/ElasticSheet.vue";
import type { Duty } from "../api/types";
const detail = ref<Duty | null>(null),
  sheetOpen = ref(false),
  sheetOrigin = ref<DOMRect | null>(null);
function openDetail(task: Duty, origin: DOMRect) {
  detail.value = task;
  sheetOrigin.value = origin;
  sheetOpen.value = true;
}
const session = useSession(),
  data = ref<Today | null>(null),
  unread = ref(0),
  busy = ref(false);
const { loading, error, refresh } = useLoad(async () => {
  await session.refresh();
  data.value = session.dorm ? await api<Today>("/duties/today") : null;
  unread.value = (
    await api<{ unread_count: number }>("/notifications?page_size=1")
  ).unread_count;
});
onActivated(refresh);
async function complete() {
  busy.value = true;
  try {
    await patch(`/duties/${data.value!.task!.id}/complete`);
    showToast("值日已完成，辛苦啦");
    await refresh();
  } catch (e) {
    showToast((e as Error).message);
    await refresh();
  } finally {
    busy.value = false;
  }
}
async function generate() {
  busy.value = true;
  try {
    await post("/duties/generate", {
      start_date: data.value!.today,
      days: 30,
      expected_version: session.dorm!.schedule_version,
    });
    showToast("未来 30 天已安排");
    await refresh();
  } catch (e) {
    showToast((e as Error).message);
  } finally {
    busy.value = false;
  }
}
const taskItems = computed(
  () =>
    data.value?.task?.task_text
      .split(/[\n、，,；;]/)
      .map((s) => s.trim())
      .filter(Boolean) || [],
);
const dateText = (v: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Shanghai",
  }).format(new Date(v + "T12:00:00+08:00"));
const clock = (v: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(v));
</script>
<template>
  <main class="page home-page">
    <header class="home-top">
      <router-link to="/dorm" class="dorm-link"
        ><span class="mini-mark"><van-icon name="flower-o" /></span
        >{{ session.dorm?.name || "我的宿舍"
        }}<van-icon aria-hidden="true" name="arrow-down" /></router-link
      ><router-link to="/messages" class="message-link" aria-label="消息"
        ><van-badge :content="unread || undefined"
          ><van-icon aria-hidden="true" name="bell" size="23" /></van-badge
      ></router-link>
    </header>
    <router-link to="/" class="admin-back">← 返回个人任务</router-link>
    <div class="page-heading">
      <span class="eyebrow">轮到 · 宿舍日常</span>
      <h1>今天轮到谁<br /><span>照顾我们的宿舍？</span></h1>
    </div>
    <div v-if="error" class="error-panel" role="alert">
      {{ error }}<van-button size="small" @click="refresh">重新加载</van-button>
    </div>
    <van-loading v-if="loading && !data" class="page-loading"
      >正在查看今日安排</van-loading
    >
    <EmptyState
      v-else-if="!session.dorm"
      title="一起住，也一起照顾"
      text="创建一个宿舍，或者向室友要一个邀请码。"
      ><router-link to="/dorm"
        ><van-button type="primary">创建或加入宿舍</van-button></router-link
      ></EmptyState
    >
    <template v-else-if="data">
      <div class="today-label">
        <span>{{ dateText(data.today) }}</span
        ><span>今日值日</span>
      </div>
      <article
        v-if="data.task"
        class="today-card"
        :class="{ done: data.task.status === 'completed' }"
      >
        <div class="card-topline">
          <span class="eyebrow">TODAY'S TURN</span
          ><StatusBadge :status="data.task.display_status" />
        </div>
        <div class="assignee-line">
          <h2>{{ data.task.assignee_name_snapshot }}</h2>
          <span class="person-symbol"
            ><van-icon
              aria-hidden="true"
              :name="data.task.status === 'completed' ? 'passed' : 'user-o'"
          /></span>
        </div>
        <ul class="today-tasks">
          <li v-for="(item, index) in taskItems" :key="index">
            <van-icon
              :name="data.task.status === 'completed' ? 'passed' : 'circle'"
            />{{ item }}
          </li>
        </ul>
        <div class="deadline-row">
          <span><van-icon aria-hidden="true" name="clock-o" /> 截止时间</span
          ><strong>{{ clock(data.task.deadline_at) }}</strong>
        </div>
        <van-button
          v-if="data.task.can_complete"
          block
          class="complete-button"
          :loading="busy"
          @click="complete"
          ><van-icon aria-hidden="true" name="checked" />{{
            data.task.display_status === "overdue"
              ? "补打卡，记录完成"
              : "完成值日打卡"
          }}</van-button
        >
        <div v-else class="card-foot">
          {{
            data.task.status === "completed"
              ? "今天的小事，已经被认真做好。"
              : "今天由室友负责，给 TA 一点支持。"
          }}<span v-if="data.task.completed_at"
            >完成于 {{ clock(data.task.completed_at) }}</span
          >
        </div>
      </article>
      <EmptyState
        v-else
        title="今天还没有排班"
        text="管理员生成排班后，大家就能看到自己的值日安排。"
        ><van-button
          v-if="session.dorm.is_admin"
          type="primary"
          :loading="busy"
          @click="generate"
          >生成未来 30 天排班</van-button
        ></EmptyState
      >
      <div class="section-title">
        <h2>接下来的一周</h2>
        <router-link to="/schedule"
          >查看全部 <van-icon aria-hidden="true" name="arrow"
        /></router-link>
      </div>
      <div class="list-card">
        <DutyRow
          v-for="(task, index) in data.recent"
          :key="task.id"
          :task="task"
          interactive
          :style="{ '--item-index': index }"
          @select="openDetail"
        />
        <p v-if="!data.recent.length" class="subtle empty-list">
          近期还没有安排
        </p>
      </div>
      <router-link to="/dorm?settings=1" class="rules-link"
        ><span class="rules-icon"><van-icon name="setting-o" /></span>
        <div>
          <strong>你们的值日规则</strong>
          <p>
            每人连续 {{ session.dorm.schedule_rules.rotation_days }} 个值日日期
            · 未来 {{ session.dorm.schedule_rules.horizon_days }} 天
          </p>
        </div>
        <van-icon name="arrow"
      /></router-link>
    </template>
    <button
      v-if="data"
      class="text-button refresh-button"
      :disabled="loading"
      @click="refresh"
    >
      {{ loading ? "正在刷新…" : "刷新服务器数据" }}
    </button>
    <ElasticSheet
      v-model="sheetOpen"
      :title="
        detail
          ? detail.duty_date.slice(5).replace('-', '月') + '日的安排'
          : '值日详情'
      "
      :origin="sheetOrigin"
    >
      <template v-if="detail"
        ><div class="sheet-assignee">
          <span class="avatar-large">{{
            detail.assignee_name_snapshot.slice(0, 1)
          }}</span>
          <div>
            <h3>{{ detail.assignee_name_snapshot }}</h3>
            <StatusBadge :status="detail.display_status" />
          </div>
        </div>
        <p class="sheet-task-copy">{{ detail.task_text }}</p>
        <div class="sheet-meta">
          <span>截止时间</span><strong>{{ clock(detail.deadline_at) }}</strong>
        </div>
        <p v-if="detail.completed_at" class="helper">
          完成于 {{ clock(detail.completed_at) }}
        </p>
        <router-link
          :to="`/schedule?date=${detail.duty_date}`"
          @click="sheetOpen = false"
          ><van-button block type="primary" class="spaced"
            >在排班中查看<van-icon name="arrow" /></van-button></router-link
      ></template>
    </ElasticSheet>
  </main>
</template>
