<script setup lang="ts">
import { ref } from "vue";
import { showToast } from "vant";
import { api, patch } from "../api";
import type { Note, Page } from "../api/types";
import { formatMoment } from "../api/date";
import { useLoad } from "../components/useLoad";
import EmptyState from "../components/EmptyState.vue";
const notes = ref<Note[]>([]),
  unread = ref(0),
  page = ref(1),
  total = ref(0),
  only = ref(false);
const { loading, error, refresh } = useLoad(async () => {
  const result = await api<Page<Note> & { unread_count: number }>(
    `/notifications?page=${page.value}&unread_only=${only.value}&page_size=20`,
  );
  notes.value = result.items;
  total.value = result.total;
  unread.value = result.unread_count;
});
async function read(note: Note) {
  if (note.read_at) return;
  try {
    await patch(`/notifications/${note.id}/read`);
    await refresh();
  } catch (e) {
    showToast((e as Error).message);
  }
}
</script>
<template>
  <main class="page">
    <div class="section-heading">
      <span class="eyebrow">A FRIENDLY REMINDER</span>
      <h1>
        宿舍消息 <small class="count">{{ unread }}</small>
      </h1>
      <p>到你的时候，轻轻提醒一下。</p>
    </div>
    <div class="button-row">
      <van-checkbox
        v-model="only"
        @change="
          page = 1;
          refresh();
        "
        >只看未读</van-checkbox
      ><button class="text-button" @click="refresh">刷新</button>
    </div>
    <div v-if="error" class="error-panel">
      {{ error }}<van-button size="small" @click="refresh">重试</van-button>
    </div>
    <van-loading v-if="loading" class="page-loading" />
    <button
      v-for="note in notes"
      :key="note.id"
      class="note-card"
      :class="{ unread: !note.read_at }"
      @click="read(note)"
    >
      <div>
        <strong>{{ note.title }}</strong
        ><i v-if="!note.read_at" class="unread-dot"></i>
      </div>
      <p>{{ note.body }}</p>
      <span
        >{{ formatMoment(note.created_at) }} ·
        {{ note.read_at ? "已读" : "点击标为已读" }}</span
      >
    </button>
    <EmptyState
      v-if="!notes.length && !loading"
      title="暂时没有新消息"
      text="提醒会在前一天 21:00、当天 08:00 和未完成时的 19:00 出现。"
      icon="bell"
    />
    <div v-if="total > 20" class="pagination">
      <van-button
        size="small"
        :disabled="page === 1"
        @click="
          page--;
          refresh();
        "
        >上一页</van-button
      ><span>{{ page }} / {{ Math.ceil(total / 20) }}</span
      ><van-button
        size="small"
        :disabled="page * 20 >= total"
        @click="
          page++;
          refresh();
        "
        >下一页</van-button
      >
    </div>
  </main>
</template>
