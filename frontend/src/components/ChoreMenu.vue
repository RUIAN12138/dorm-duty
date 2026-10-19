<script setup lang="ts">
import ElasticSheet from "./ElasticSheet.vue";
import ActionItem from "./ActionItem.vue";
import MemberMark from "./MemberMark.vue";
import type { ChoreMember } from "../api/chores";
export type MenuAction =
  | "reminder"
  | "messages"
  | "join"
  | "push"
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
    :title="dormName || '宿舍'"
    motion="bottom"
    @closed="emit('closed')"
  >
    <div class="menu-profile">
      <MemberMark :id="member.marker_id" :size="34" />
      <div>
        <strong>{{ member.nickname }}</strong
        ><span>{{
          demo ? "游客体验" : creator ? "宿舍创建者" : "宿舍成员"
        }}</span>
      </div>
    </div>
    <div class="menu-quick">
      <ActionItem
        tile
        label="提醒室友"
        icon="chat-o"
        data-testid="open-reminder"
        @click="emit('action', 'reminder')"
      />
      <ActionItem
        tile
        :delay="0.02"
        label="室友消息"
        icon="comment-o"
        :badge="unreadCount"
        data-testid="open-messages"
        @click="emit('action', 'messages')"
      />
      <ActionItem
        tile
        :delay="0.04"
        label="切换宿舍"
        icon="exchange"
        data-testid="guest-change-dorm"
        @click="emit('action', 'join')"
      />
      <ActionItem
        tile
        :delay="0.06"
        label="系统通知"
        icon="bell"
        data-testid="open-system-notifications"
        @click="emit('action', 'push')"
      />
    </div>
    <div class="menu-section">
      <ActionItem
        v-if="creator && !demo"
        label="任务设置"
        icon="setting-o"
        data-testid="open-chore-settings"
        @click="emit('action', 'settings')"
      />
      <ActionItem
        label="个人与更多"
        icon="contact-o"
        data-testid="open-preferences"
        @click="emit('action', 'preferences')"
      />
    </div>
  </ElasticSheet>
  <ElasticSheet
    v-model="preferences"
    title="个人与更多"
    motion="bottom"
    @closed="emit('closed')"
  >
    <div class="menu-section">
      <ActionItem
        v-if="!demo"
        label="邮箱账号与提醒"
        icon="envelop-o"
        data-testid="open-email-account"
        @click="emit('action', 'email')"
      />
      <ActionItem
        v-if="!demo"
        label="切换我的身份"
        icon="friends-o"
        data-testid="guest-change-member"
        @click="emit('action', 'identity')"
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
    </div>
    <div class="menu-section">
      <a
        class="repository-link"
        href="https://github.com/RUIAN12138/dorm-duty"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="project-github"
      >
        <van-icon name="link-o" aria-hidden="true" /><span
          >项目源码 · GitHub</span
        ><span aria-hidden="true">↗</span>
      </a>
    </div>
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
  color: #777;
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
  background: #fafafa;
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
  color: #111;
  font-size: 16px;
  text-decoration: none;
  border-radius: 16px;
}
.repository-link > span:nth-child(2) {
  flex: 1;
}
</style>
