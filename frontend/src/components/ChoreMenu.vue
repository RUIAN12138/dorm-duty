<script setup lang="ts">
import CheckForUpdates from "./CheckForUpdates.vue";
import AppearanceSettings from "./AppearanceSettings.vue";
import ElasticSheet from "./ElasticSheet.vue";
import ActionItem from "./ActionItem.vue";
import MemberMark from "./MemberMark.vue";
import type { ChoreMember } from "../api/chores";
export type MenuAction =
  | "order"
  | "reminder"
  | "messages"
  | "join"
  | "push"
  | "companion"
  | "preferences"
  | "settings"
  | "email"
  | "identity"
  | "marker"
  | "create"
  | "recovery"
  | "refresh";
defineProps<{
  dormName: string;
  member: ChoreMember;
  creator: boolean;
  demo: boolean;
  unreadCount: number;
  disabled: boolean;
}>();
const tools = defineModel<boolean>("tools", { required: true });
const preferences = defineModel<boolean>("preferences", { required: true });
const emit = defineEmits<{ action: [value: MenuAction]; closed: [] }>();
</script>
<template>
  <ElasticSheet
    v-model="tools"
    title="设置"
    navigation-root
    expandable
    motion="bottom"
    @closed="emit('closed')"
  >
    <div class="menu-profile">
      <MemberMark :id="member.marker_id" :size="34" />
      <div>
        <strong>{{ member.nickname }}</strong
        ><span
          >{{ dormName }} ·
          {{ demo ? "游客" : creator ? "创建者" : "室友" }}</span
        >
      </div>
    </div>
    <div class="menu-quick">
      <ActionItem
        tile
        label="室友消息"
        icon="comment-o"
        :badge="unreadCount"
        data-testid="open-messages"
        @click="emit('action', 'messages')"
      />
      <ActionItem
        tile
        label="提醒室友"
        icon="chat-o"
        data-testid="open-reminder"
        @click="emit('action', 'reminder')"
      />
    </div>
    <AppearanceSettings />
    <ActionItem
      label="任务轮序"
      icon="orders-o"
      data-testid="open-water-order"
      @click="emit('action', 'order')"
    />
    <div class="menu-section">
      <ActionItem
        label="球球设置"
        icon="smile-comment-o"
        data-testid="open-companion-settings"
        @click="emit('action', 'companion')"
      />
      <ActionItem
        v-if="creator && !demo"
        label="任务设置"
        icon="setting-o"
        data-testid="open-chore-settings"
        @click="emit('action', 'settings')"
      />
      <ActionItem
        label="账号与宿舍"
        icon="contact-o"
        data-testid="open-preferences"
        @click="emit('action', 'preferences')"
      />
    </div>
    <CheckForUpdates />
  </ElasticSheet>
  <ElasticSheet
    v-model="preferences"
    title="账号与宿舍"
    motion="bottom"
    @closed="emit('closed')"
  >
    <div class="menu-section">
      <ActionItem
        v-if="!demo"
        label="邮箱账号"
        icon="envelop-o"
        data-testid="open-email-account"
        @click="emit('action', 'email')"
      />
      <ActionItem
        label="通知偏好"
        icon="bell"
        data-testid="open-system-notifications"
        @click="emit('action', 'push')"
      />
      <ActionItem
        label="更换标记"
        icon="smile-o"
        data-testid="open-marker"
        @click="emit('action', 'marker')"
      />
    </div>
    <div class="menu-section">
      <ActionItem
        label="切换宿舍"
        icon="exchange"
        data-testid="guest-change-dorm"
        @click="emit('action', 'join')"
      />
      <ActionItem
        v-if="!demo"
        label="切换我的身份"
        icon="friends-o"
        data-testid="guest-change-member"
        @click="emit('action', 'identity')"
      />
    </div>
    <details class="menu-advanced">
      <summary>更多操作</summary>
      <ActionItem
        label="创建宿舍"
        icon="plus"
        data-testid="guest-create-dorm"
        @click="emit('action', 'create')"
      />
      <ActionItem
        v-if="!demo"
        :label="creator ? '管理恢复码' : '恢复管理权限'"
        icon="shield-o"
        data-testid="open-creator-recovery"
        @click="emit('action', 'recovery')"
      />
      <ActionItem
        label="刷新安排"
        icon="replay"
        :disabled="disabled"
        data-testid="chore-refresh"
        @click="emit('action', 'refresh')"
      />
    </details>
    <a
      class="repository-link"
      href="https://github.com/RUIAN12138/dorm-duty"
      target="_blank"
      rel="noopener noreferrer"
      data-testid="project-github"
      ><van-icon name="link-o" aria-hidden="true" /><span
        >项目源码 · GitHub</span
      ><span aria-hidden="true">↗</span></a
    >
  </ElasticSheet>
</template>

<style scoped>
.menu-profile {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 4px 24px;
}
.menu-profile > div {
  display: grid;
  gap: 5px;
}
.menu-profile strong {
  font-size: 20px;
  font-weight: 600;
}
.menu-profile span {
  font-size: 14px;
  color: var(--app-tone-h777, #777);
}
.menu-quick {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.menu-section {
  padding: 7px;
  margin-top: 16px;
  border-radius: 22px;
  background: var(--app-tone-hfafafa, #fafafa);
}
.menu-section + .menu-section {
  margin-top: 12px;
}
.repository-link {
  display: flex;
  align-items: center;
  gap: 13px;
  min-height: 62px;
  padding: 10px 14px;
  color: var(--app-tone-h111, #111);
  font-size: 16px;
  text-decoration: none;
  border-radius: 16px;
}
.repository-link > span:nth-child(2) {
  flex: 1;
}
</style>

<style scoped>
.menu-advanced {
  margin: 12px 0 20px;
}
.menu-advanced summary {
  padding: 12px 4px;
  font-size: 13px;
  color: var(--app-tone-h999, #999);
  cursor: pointer;
}
</style>
