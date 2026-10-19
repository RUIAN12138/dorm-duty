<script setup lang="ts">
import { ref } from "vue";
import { showToast } from "vant";
import { api, patch, query } from "../api";
import { shiftDay, formatMoment, currentDay } from "../api/date";
import type { Duty, Page, Today } from "../api/types";
import { useSession } from "../stores/session";
import { useLoad } from "../components/useLoad";
import DutyRow from "../components/DutyRow.vue";
import EmptyState from "../components/EmptyState.vue";
const session = useSession(),
  rows = ref<Duty[]>([]),
  status = ref(""),
  member = ref(""),
  page = ref(1),
  total = ref(0),
  busy = ref(0),
  today = ref(currentDay());
const { loading, error, refresh } = useLoad(async (signal) => {
  await session.refresh();
  if (signal.aborted) return;
  if (!session.dorm) return;
  today.value = (await api<Today>("/duties/today", { signal })).today;
  const result = await api<Page<Duty>>(
    "/duties?" +
      query({
        start_date: shiftDay(today.value, -89),
        end_date: today.value,
        status: status.value,
        assignee_id: member.value,
        page: page.value,
        page_size: 20,
      }),
    { signal },
  );
  rows.value = result.items;
  total.value = result.total;
});
async function filter() {
  page.value = 1;
  await refresh();
}
async function complete(id: number) {
  busy.value = id;
  try {
    await patch(`/duties/${id}/complete`);
    showToast("已记录完成");
    await refresh();
  } catch (e) {
    showToast((e as Error).message);
    await refresh();
  } finally {
    busy.value = 0;
  }
}
async function turn(next: number) {
  page.value = next;
  await refresh();
}
</script>
<template>
  <main class="page">
    <div class="section-heading">
      <span class="eyebrow">LITTLE THINGS, WELL DONE</span>
      <h1>值日记录</h1>
      <p>看看最近 90 天，大家的认真。</p>
    </div>
    <div v-if="error" class="error-panel">
      {{ error }}<van-button size="small" @click="refresh">重试</van-button>
    </div>
    <EmptyState v-if="!session.dorm && !loading" title="加入宿舍后查看记录"
      ><router-link to="/dorm"
        ><van-button type="primary">去加入宿舍</van-button></router-link
      ></EmptyState
    >
    <template v-if="session.dorm"
      ><div class="filter-row">
        <select v-model="status" aria-label="状态筛选" @change="filter">
          <option value="">全部状态</option>
          <option value="pending">待完成</option>
          <option value="completed">已完成</option>
          <option value="overdue">逾期未完成</option>
          <option value="completed_late">逾期完成</option></select
        ><select v-model="member" aria-label="成员筛选" @change="filter">
          <option value="">全部成员</option>
          <option
            v-for="m in session.dorm.members"
            :key="m.user_id"
            :value="m.user_id"
          >
            {{ m.nickname }}
          </option>
        </select>
      </div>
      <van-loading v-if="loading" class="page-loading" />
      <div class="history-list">
        <article v-for="task in rows" :key="task.id" class="history-card">
          <DutyRow :task="task" />
          <div v-if="task.completed_at" class="history-foot">
            <van-icon aria-hidden="true" name="passed" />完成于
            {{ formatMoment(task.completed_at) }}
          </div>
          <div v-else-if="task.can_complete" class="history-foot">
            <span>{{
              task.display_status === "overdue"
                ? "逾期后仍可记录完成"
                : "今天记得打卡"
            }}</span
            ><van-button
              size="small"
              plain
              type="primary"
              :loading="busy === task.id"
              :disabled="busy !== 0"
              @click="complete(task.id)"
              >{{
                task.display_status === "overdue" ? "补打卡" : "完成值日"
              }}</van-button
            >
          </div>
        </article>
      </div>
      <EmptyState
        v-if="!rows.length && !loading"
        title="暂时没有这样的记录"
        text="可以换个筛选条件，或先生成值日排班。"
      />
      <div v-if="total > 20" class="pagination">
        <van-button
          size="small"
          :disabled="page === 1 || loading"
          @click="turn(page - 1)"
          >上一页</van-button
        ><span>{{ page }} / {{ Math.ceil(total / 20) }}</span
        ><van-button
          size="small"
          :disabled="page * 20 >= total || loading"
          @click="turn(page + 1)"
          >下一页</van-button
        >
      </div>
    </template>
  </main>
</template>
