<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { TabsRoot } from "reka-ui";
import { ApiError } from "../api";
import {
  choreRequest,
  type ChoreCategory,
  type ChoreMember,
} from "../api/chores";
import ElasticSheet from "./ElasticSheet.vue";
import SortableMembers from "./SortableMembers.vue";
import MemberMark from "./MemberMark.vue";
import ElasticSegments from "./ElasticSegments.vue";
import HintPopover from "./HintPopover.vue";
const props = defineProps<{
  modelValue: boolean;
  members: ChoreMember[];
  category: ChoreCategory;
  categories?: ChoreCategory[];
  currentId?: number;
  editable: boolean;
  version: number;
  token: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [];
  closed: [];
  recover: [];
}>();
const selectedKey = ref("water");
const selectedCategory = computed(
  () =>
    props.categories?.find((c) => c.key === selectedKey.value) ||
    props.category,
);
const options = computed(() =>
  (props.categories || [props.category])
    .filter((c) => c.enabled)
    .map((c) => ({
      value: c.key,
      label: c.name,
      testId: `order-category-${c.key}`,
    })),
);
const order = ref<number[]>([]),
  saving = ref(false),
  error = ref("");
let version = 0,
  category: ChoreCategory;
watch(
  () => [props.modelValue, selectedKey.value] as const,
  ([open]) => {
    if (open) {
      order.value = [...selectedCategory.value.rotation_order];
      category = JSON.parse(JSON.stringify(selectedCategory.value));
      version = props.version;
      error.value = "";
    }
  },
);
async function save() {
  if (saving.value || !props.editable) return;
  saving.value = true;
  error.value = "";
  try {
    await choreRequest("/chores/order", props.token, {
      method: "PATCH",
      body: JSON.stringify({
        version,
        key: category.key,
        rotation_order: order.value,
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
    :title="`${selectedCategory.name}轮序`"
    motion="bottom"
    sticky-header
    @update:model-value="emit('update:modelValue', $event)"
    @closed="emit('closed')"
  >
    <TabsRoot v-model="selectedKey" :inert="saving ? true : undefined"
      ><ElasticSegments
        v-if="options.length > 1"
        v-model="selectedKey"
        :options="options"
        group-label="选择任务轮序"
    /></TabsRoot>
    <div class="order-help">
      <HintPopover
        title="调整轮序"
        :text="
          editable
            ? '长按名字提起整行，上下拖动调整先后，松手后保存。'
            : '游客仅可查看。加入正式宿舍后，每位成员都能调整轮序。'
        "
      />
    </div>
    <SortableMembers
      v-if="editable"
      v-model="order"
      :members="members"
      :active="modelValue"
      :disabled="saving"
      :category-key="selectedCategory.key"
    />
    <ol v-else class="order-people">
      <li
        v-for="(id, index) in selectedCategory.rotation_order"
        :key="id"
        :style="{ '--entry-index': index }"
        :class="{ current: selectedKey === 'water' && id === currentId }"
      >
        <span class="order-number">{{ index + 1 }}</span
        ><MemberMark
          :id="members.find((m) => m.user_id === id)?.marker_id"
          :size="27"
        /><strong>{{
          members.find((m) => m.user_id === id)?.nickname || "室友"
        }}</strong
        ><span
          v-if="selectedKey === 'water' && id === currentId"
          class="current-label"
          >当前轮到</span
        >
      </li>
    </ol>
    <p v-if="error" class="order-error" role="alert">{{ error }}</p>
    <div v-if="editable" class="order-save">
      <button
        class="guest-primary"
        :data-testid="
          selectedKey === 'water' ? 'water-order-save' : 'round-order-save'
        "
        :disabled="saving"
        @click="save"
      >
        {{ saving ? "正在保存…" : "保存轮序" }}
      </button>
    </div>
  </ElasticSheet>
</template>
<style scoped>
.order-help {
  display: flex;
  justify-content: flex-end;
  margin: 12px 0;
}
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
  background: #fff;
  box-shadow: 0 3px 7px #00000005;
  animation: order-arrive 480ms cubic-bezier(0.22, 1, 0.36, 1)
    calc(var(--entry-index) * 45ms) both;
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

<style scoped>
@keyframes order-arrive {
  from {
    opacity: 0;
    transform: translateY(calc(var(--entry-index) * -24px)) translateX(20px)
      scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .order-people li {
    animation: none;
  }
}
</style>
