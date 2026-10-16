<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Reorder } from "motion-v";
import type { ChoreMember } from "../api/chores";
import SortableMemberRow from "./SortableMemberRow.vue";
const props = withDefaults(
  defineProps<{
    modelValue: number[];
    members: ChoreMember[];
    active: boolean;
    disabled?: boolean;
    categoryKey?: string;
    completedIds?: number[];
    currentId?: number;
    currentLabel?: string;
  }>(),
  { categoryKey: "water" },
);
const emit = defineEmits<{ "update:modelValue": [order: number[]] }>();
const order = ref([...props.modelValue]);
const dragging = ref<number | null>(null);
const reset = ref(0);
const announcement = ref("");
let original: number[] = [];
const people = computed(
  () => new Map(props.members.map((person) => [person.user_id, person])),
);
function person(id: number): ChoreMember {
  return (
    people.value.get(id) || {
      user_id: id,
      nickname: "室友",
      marker_id: "pixel-01",
    }
  );
}
function announce(id: number) {
  announcement.value = `${people.value.get(id)?.nickname || "室友"}，第 ${order.value.indexOf(id) + 1} 位，共 ${order.value.length} 位`;
}
function cancel() {
  if (dragging.value !== null) order.value = [...original];
  dragging.value = null;
  reset.value++;
}
function escape(event: KeyboardEvent) {
  if (dragging.value === null) return;
  event.preventDefault();
  event.stopPropagation();
  cancel();
}
function begin(id: number) {
  original = [...order.value];
  dragging.value = id;
  announce(id);
}
function preview(values: unknown[]) {
  const ids = values.filter((id): id is number => typeof id === "number");
  if (
    dragging.value === null ||
    ids.length !== order.value.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !order.value.includes(id))
  )
    return;
  order.value = ids;
  announce(dragging.value);
}
function finish(id: number, cancelled: boolean) {
  if (dragging.value !== id) return;
  if (cancelled) cancel();
  else {
    dragging.value = null;
    emit("update:modelValue", [...order.value]);
  }
}
function step(id: number, delta: number, _keyboard = false) {
  cancel();
  const index = order.value.indexOf(id),
    to = index + delta;
  if (
    props.disabled ||
    !props.active ||
    index < 0 ||
    to < 0 ||
    to >= order.value.length
  )
    return;
  const next = [...order.value];
  next.splice(index, 1);
  next.splice(to, 0, id);
  order.value = next;
  announce(id);
  emit("update:modelValue", next);
}
watch(
  () => props.modelValue,
  (value) => {
    if (
      value.length === order.value.length &&
      value.every((id, index) => id === order.value[index])
    )
      return;
    cancel();
    order.value = [...value];
  },
  { deep: true },
);
watch(
  () => [props.active, props.disabled],
  () => {
    if (!props.active || props.disabled) cancel();
  },
);
</script>
<template>
  <div class="water-sorter" @keydown.esc="escape">
    <p class="sort-hint">按住室友或右侧拖动柄，调整先后</p>
    <Reorder.Group
      as="ol"
      axis="y"
      :values="order"
      @update:values="preview"
      :aria-label="categoryKey === 'water' ? '抬水轮换顺序' : '值日成员排列'"
      class="sort-list"
      :layout-scroll="true"
    >
      <SortableMemberRow
        v-for="(id, index) in order"
        :key="id"
        :member="person(id)"
        :category-key="categoryKey"
        :completed="completedIds ? completedIds.includes(id) : undefined"
        :current="id === currentId"
        :current-label="currentLabel"
        :index="index"
        :count="order.length"
        :active="active"
        :disabled="disabled"
        :reset="reset"
        @start="begin"
        @finish="finish"
        @step="step"
      />
    </Reorder.Group>
    <span class="sort-announcement" role="status" aria-live="polite">{{
      announcement
    }}</span>
  </div>
</template>
<style scoped>
.sort-hint {
  margin: 0 0 12px;
  font-size: 14px;
  color: #666;
}
.sort-list {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
}
.sort-announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
