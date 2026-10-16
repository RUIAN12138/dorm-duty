<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useRoute } from "vue-router";
const route = useRoute();
import { showConfirmDialog } from "vant";
import { showToast } from "../interaction/notice";
import { useSession } from "../stores/session";
import { api, post } from "../api";
import { useLoad } from "../components/useLoad";
import EmptyState from "../components/EmptyState.vue";
import ScheduleSettings from "../components/ScheduleSettings.vue";
const session = useSession(),
  name = ref(""),
  invite = ref(""),
  mode = ref("join"),
  busy = ref(false);
const { loading, error, refresh } = useLoad(async () => {
  await session.refresh();
  if (session.dorm) {
    name.value = session.dorm.name;
  }
});
function scrollSettings() {
  document.getElementById("duty-settings")?.scrollIntoView({
    block: "start",
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
}
watch(
  [() => route.query.settings, loading],
  async () => {
    if (route.query.settings === "1" && !loading.value) {
      await nextTick();
      scrollSettings();
    }
  },
  { immediate: true },
);
async function act(fn: () => Promise<unknown>, message: string) {
  busy.value = true;
  try {
    await fn();
    showToast(message);
    await refresh();
  } catch (e) {
    showToast((e as Error).message);
    await refresh();
  } finally {
    busy.value = false;
  }
}
function enter() {
  return act(
    () =>
      mode.value === "create"
        ? post("/dorms", { name: name.value })
        : post("/dorms/join", { invite_code: invite.value }),
    "欢迎加入宿舍",
  );
}
async function remove(uid: number) {
  try {
    await showConfirmDialog({
      title: "移除成员？",
      message: "历史记录会保留，未来排班会重新安排。",
    });
    await act(
      () =>
        api(
          `/dorms/current/members/${uid}?expected_version=${session.dorm!.schedule_version}`,
          { method: "DELETE" },
        ),
      "成员已移除",
    );
  } catch {}
}
async function transfer(uid: number) {
  try {
    await showConfirmDialog({
      title: "转移管理员？",
      message: "转移后你将成为普通成员。",
    });
    await act(
      () =>
        post("/dorms/current/transfer-admin", {
          user_id: uid,
          expected_version: session.dorm!.schedule_version,
        }),
      "管理员已转移",
    );
  } catch {}
}
async function leave() {
  try {
    await showConfirmDialog({
      title: "退出宿舍？",
      message: "退出后无法查看宿舍数据，已有历史记录仍会保留。",
    });
    await act(() => post("/dorms/current/leave"), "已退出宿舍");
  } catch {}
}
async function copy() {
  try {
    await navigator.clipboard.writeText(session.dorm!.invite_code);
    showToast("邀请码已复制");
  } catch {
    showToast("请长按邀请码复制");
  }
}
async function rotate() {
  try {
    await showConfirmDialog({
      title: "更新邀请码？",
      message: "旧邀请码将立即失效。",
    });
    await act(() => post("/dorms/current/invite-code/rotate"), "邀请码已更新");
  } catch {}
}
</script>
<template>
  <main class="page">
    <div class="section-heading">
      <span class="eyebrow">OUR SHARED PLACE</span>
      <h1>宿舍管理</h1>
      <p>把大家安排在一起。</p>
      <button
        v-if="session.dorm?.is_admin"
        type="button"
        class="dorm-settings-shortcut"
        @click="scrollSettings"
      >
        <van-icon name="setting-o" /> 自定义排班与任务<van-icon
          name="arrow-down"
        />
      </button>
    </div>
    <div v-if="error" class="error-panel">
      {{ error }}<van-button size="small" @click="refresh">重试</van-button>
    </div>
    <van-loading v-if="loading" class="page-loading" />
    <template v-if="!session.dorm"
      ><div class="segmented">
        <button :class="{ active: mode === 'join' }" @click="mode = 'join'">
          邀请码加入</button
        ><button
          :class="{ active: mode === 'create' }"
          @click="mode = 'create'"
        >
          创建宿舍
        </button>
      </div>
      <EmptyState
        :title="mode === 'join' ? '室友已经在等你' : '给共同生活起个名字'"
        :text="
          mode === 'join'
            ? '输入管理员分享的邀请码，即可加入。'
            : '创建者将成为管理员，之后邀请室友加入。'
        "
      />
      <van-form @submit="enter"
        ><van-field
          :disabled="loading || busy"
          v-if="mode === 'create'"
          v-model="name"
          label="宿舍名称"
          placeholder="例如 6-402"
          maxlength="64"
          :rules="[{ required: true, message: '请输入宿舍名称' }]"
        /><van-field
          :disabled="loading || busy"
          v-else
          v-model="invite"
          label="邀请码"
          placeholder="8 位邀请码"
          maxlength="16"
          :rules="[{ required: true, message: '请输入邀请码' }]"
        /><van-button
          block
          type="primary"
          native-type="submit"
          :loading="busy"
          class="spaced"
          >{{ mode === "create" ? "创建宿舍" : "加入宿舍" }}</van-button
        ></van-form
      >
    </template>
    <template v-else
      ><div class="invite-card">
        <span>宿舍邀请码</span><strong>{{ session.dorm.invite_code }}</strong>
        <p>分享给室友，一起加入 {{ session.dorm.name }}</p>
        <div class="button-row">
          <van-button size="small" @click="copy">复制邀请码</van-button
          ><van-button
            v-if="session.dorm.is_admin"
            size="small"
            @click="rotate"
            :disabled="busy"
            >更新邀请码</van-button
          >
        </div>
      </div>
      <div class="section-title">
        <h2>宿舍成员</h2>
        <span>{{ session.dorm.members.length }} 人</span>
      </div>
      <div class="list-card">
        <div
          v-for="member in session.dorm.members"
          :key="member.user_id"
          class="member-row"
        >
          <span class="avatar-small">{{ member.nickname.slice(0, 1) }}</span>
          <div class="row-main">
            <strong
              >{{ member.nickname }}
              {{ member.user_id === session.user?.id ? "· 我" : "" }}</strong
            ><span>{{ member.role === "admin" ? "管理员" : "室友" }}</span>
          </div>
          <div
            v-if="session.dorm.is_admin && member.user_id !== session.user?.id"
            class="member-actions"
          >
            <button :disabled="busy" @click="transfer(member.user_id)">
              设为管理员</button
            ><button :disabled="busy" @click="remove(member.user_id)">
              移除
            </button>
          </div>
        </div>
      </div>
      <ScheduleSettings
        v-if="session.dorm.is_admin"
        id="duty-settings"
        :dorm="session.dorm"
        @saved="refresh"
      />
      <van-button
        block
        plain
        type="danger"
        class="spaced"
        :loading="busy"
        @click="leave"
        >退出宿舍</van-button
      >
      <p v-if="session.dorm.is_admin" class="helper">
        管理员需先转移管理权限，才能退出。
      </p>
    </template>
  </main>
</template>
