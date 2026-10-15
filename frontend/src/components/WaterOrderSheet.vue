<script setup lang="ts">
import { ref, watch } from "vue";
import { ApiError } from "../api";
import {
  choreRequest,
  type ChoreCategory,
  type ChoreMember,
} from "../api/chores";
import ElasticSheet from "./ElasticSheet.vue";
import SortableMembers from "./SortableMembers.vue";
import MemberMark from "./MemberMark.vue";
const props = defineProps<{
  modelValue: boolean;
  members: ChoreMember[];
  category: ChoreCategory;
  currentId?: number;
  creator: boolean;
  version: number;
  token: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [];
  closed: [];
}>();
const order = ref<number[]>([]),
  saving = ref(false),
  error = ref("");
let version = 0,
  category: ChoreCategory;
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      order.value = [...props.category.rotation_order];
      category = JSON.parse(JSON.stringify(props.category));
      version = props.version;
      error.value = "";
    }
  },
);
async function save() {
  if (saving.value || !props.creator) return;
  saving.value = true;
  error.value = "";
  try {
    await choreRequest("/chores/settings", props.token, {
      method: "PATCH",
      body: JSON.stringify({
        version,
        categories: [{ ...category, rotation_order: order.value }],
      }),
    });
    emit("saved");
    emit("update:modelValue", false);
  } catch (e) {
    error.value =
      e instanceof ApiError && e.status === 409
        ? "轮序已被更新，请关闭后重新打开再调整。"
        : (e as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <ElasticSheet
    :model-value="modelValue"
    title="抬水轮序"
    motion="bottom"
    @update:model-value="emit('update:modelValue', $event)"
    @closed="emit('closed')"
  >
    <p class="order-caption">
      {{ creator ? "按住拖动，调整先后" : "按顺序轮流抬水" }}
    </p>
    <SortableMembers
      v-if="creator"
      v-model="order"
      :members="members"
      :active="modelValue"
      :disabled="saving"
    />
    <ol v-else class="order-people">
      <li
        v-for="(id, index) in category.rotation_order"
        :key="id"
        :class="{ current: id === currentId }"
      >
        <span class="order-number">{{ index + 1 }}</span
        ><MemberMark
          :id="members.find((m) => m.user_id === id)?.marker_id"
          :size="27"
        /><strong>{{
          members.find((m) => m.user_id === id)?.nickname || "室友"
        }}</strong
        ><span v-if="id === currentId" class="current-label">当前轮到</span>
      </li>
    </ol>
    <p v-if="error" class="order-error" role="alert">{{ error }}</p>
    <div v-if="creator" class="order-save">
      <p>当前抬水人保持不变，下一次按新顺序轮换。</p>
      <button
        class="guest-primary"
        data-testid="water-order-save"
        :disabled="saving"
        @click="save"
      >
        {{ saving ? "正在保存…" : "保存轮序" }}
      </button>
    </div>
  </ElasticSheet>
</template>
<style scoped>
.order-caption {
  margin: 0 0 20px;
  font-size: 16px;
  color: #666;
}
.order-people {
  list-style: none;
  padding: 0;
  margin: 0;
}
.order-people li {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 72px;
  padding: 12px 16px;
  margin-bottom: 8px;
  border: 1px solid #eee;
  border-radius: 18px;
}
.order-number {
  width: 16px;
  color: #888;
  font-size: 14px;
}
strong {
  flex: 1;
  font-size: 18px;
  font-weight: 500;
}
.current {
  background: #f6f6f6;
}
.current-label {
  font-size: 13px;
  padding: 5px 9px;
  background: #111;
  color: white;
  border-radius: 12px;
}
.order-save {
  position: sticky;
  bottom: -24px;
  padding: 12px 0 8px;
  background: #fff;
}
.order-save p {
  font-size: 14px;
  color: #777;
  margin: 8px 0 16px;
  line-height: 1.5;
}
.order-error {
  color: #9c2929;
  font-size: 15px;
  line-height: 1.5;
}
:deep(.sort-hint) {
  display: none;
}
</style>
