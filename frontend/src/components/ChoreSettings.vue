<script setup lang="ts">
import { ref, watch } from "vue";
import { ApiError } from "../api";
import {
  choreRequest,
  type ChoreCategory,
  type ChoreMember,
} from "../api/chores";
import ElasticSheet from "./ElasticSheet.vue";
import MemberMark from "./MemberMark.vue";
const props = defineProps<{
  modelValue: boolean;
  categories: ChoreCategory[];
  members: ChoreMember[];
  version: number;
  token: string;
  initialCategory?: "floor" | "toilet" | "water";
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [];
  closed: [];
}>();
const draft = ref<ChoreCategory[]>([]),
  selectedCategory = ref("floor"),
  saving = ref(false),
  error = ref("");
const days = ["一", "二", "三", "四", "五", "六", "日"];
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      draft.value = JSON.parse(JSON.stringify(props.categories));
      selectedCategory.value = props.initialCategory || "floor";
      error.value = "";
    }
  },
);
function move(category: ChoreCategory, index: number, amount: number) {
  const next = index + amount;
  if (next < 0 || next >= category.rotation_order.length) return;
  const current = category.rotation_order[index];
  const other = category.rotation_order[next];
  if (current === undefined || other === undefined) return;
  category.rotation_order.splice(index, 1, other);
  category.rotation_order.splice(next, 1, current);
}
function person(id: number) {
  return props.members.find((member) => member.user_id === id);
}
async function save() {
  if (saving.value) return;
  const incomplete = draft.value.find(
    (category) =>
      !category.content.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(category.start_date) ||
      !/^\d{2}:\d{2}$/.test(category.deadline_time) ||
      !Number.isInteger(category.rotation_days) ||
      category.rotation_days < 1 ||
      category.rotation_days > 30,
  );
  if (incomplete) {
    selectedCategory.value = incomplete.key;
    error.value = `请补全${incomplete.name}的内容、时间和轮换设置。`;
    return;
  }
  if (
    draft.value.some(
      (category) => category.mode === "scheduled" && !category.weekdays.length,
    )
  ) {
    selectedCategory.value = draft.value.find(
      (category) => category.mode === "scheduled" && !category.weekdays.length,
    )!.key;
    error.value =
      "每类值日至少保留一个值日星期；不安排这类任务时，可以关闭启用。";
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    await choreRequest("/chores/settings", props.token, {
      method: "PATCH",
      body: JSON.stringify({ version: props.version, categories: draft.value }),
    });
    emit("saved");
    emit("update:modelValue", false);
  } catch (e) {
    error.value =
      e instanceof ApiError && e.status === 409
        ? "室友刚刚更新了排班。关闭并刷新页面后，再修改设置。"
        : (e as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <ElasticSheet
    :model-value="modelValue"
    title="宿舍任务设置"
    @update:model-value="emit('update:modelValue', $event)"
    @closed="emit('closed')"
  >
    <form
      class="chore-settings"
      data-testid="chore-settings"
      @submit.prevent="save"
    >
      <div class="category-selector" role="group" aria-label="选择要设置的任务">
        <button
          v-for="category in draft"
          :key="category.key"
          type="button"
          :aria-pressed="selectedCategory === category.key"
          :data-testid="`settings-select-${category.key}`"
          @click="selectedCategory = category.key"
        >
          {{ category.name }}
        </button>
      </div>
      <fieldset
        v-for="category in draft.filter(
          (item) => item.key === selectedCategory,
        )"
        :key="category.key"
        :disabled="saving"
      >
        <legend>{{ category.name }}</legend>
        <label class="settings-enabled"
          ><span>启用{{ category.name }}</span
          ><input
            v-model="category.enabled"
            type="checkbox"
            :data-testid="`settings-enabled-${category.key}`"
        /></label>
        <label :for="`content-${category.key}`">具体要做什么</label
        ><textarea
          :id="`content-${category.key}`"
          v-model="category.content"
          :data-testid="`settings-content-${category.key}`"
          maxlength="500"
          rows="2"
          required
        />
        <template v-if="category.key !== 'water'">
          <span class="settings-label">值日方式</span>
          <div
            class="category-selector mode-selector"
            role="group"
            aria-label="值日方式"
          >
            <button
              type="button"
              :aria-pressed="category.mode === 'self_round'"
              :data-testid="`mode-round-${category.key}`"
              @click="category.mode = 'self_round'"
            >
              自由轮次
            </button>
            <button
              type="button"
              :aria-pressed="category.mode === 'scheduled'"
              :data-testid="`mode-scheduled-${category.key}`"
              @click="category.mode = 'scheduled'"
            >
              按日排班
            </button>
          </div>
          <p v-if="category.mode === 'self_round'" class="mode-description">
            每人做一次，全员完成后开启下一轮。
          </p>
        </template>
        <p v-else class="mode-description">没水时，轮到的人抬水并打卡。</p>
        <div v-if="category.mode === 'scheduled'" class="settings-two-columns">
          <div>
            <label :for="`time-${category.key}`">截止时间</label
            ><input
              :id="`time-${category.key}`"
              v-model="category.deadline_time"
              :data-testid="`settings-time-${category.key}`"
              type="time"
              required
            />
          </div>
          <div>
            <label :for="`start-${category.key}`">开始日期</label
            ><input
              :id="`start-${category.key}`"
              v-model="category.start_date"
              :data-testid="`settings-start-${category.key}`"
              type="date"
              required
            />
          </div>
        </div>
        <template v-if="category.mode === 'scheduled'">
          <span class="settings-label">哪些天需要值日</span>
          <div class="settings-weekdays">
            <label v-for="(day, index) in days" :key="index"
              ><input
                v-model="category.weekdays"
                :value="index + 1"
                type="checkbox"
                :data-testid="`settings-weekday-${category.key}-${index}`"
              /><span>{{ day }}</span></label
            >
          </div>
          <label :for="`rotation-${category.key}`">每位室友连续负责几天</label
          ><input
            :id="`rotation-${category.key}`"
            v-model.number="category.rotation_days"
            type="number"
            min="1"
            max="30"
            :data-testid="`settings-rotation-${category.key}`"
            required
          />
        </template>
        <span v-if="category.mode !== 'self_round'" class="settings-label"
          >轮换顺序</span
        >
        <ol v-if="category.mode !== 'self_round'" class="settings-order">
          <li
            v-for="(memberId, index) in category.rotation_order"
            :key="memberId"
          >
            <span class="order-position">{{ index + 1 }}</span
            ><MemberMark
              :id="person(memberId)?.marker_id"
              :size="20"
            /><strong>{{ person(memberId)?.nickname || "室友" }}</strong
            ><button
              type="button"
              :disabled="index === 0"
              :aria-label="`${person(memberId)?.nickname}上移`"
              :data-testid="`order-up-${category.key}-${memberId}`"
              @click="move(category, index, -1)"
            >
              ↑</button
            ><button
              type="button"
              :disabled="index === category.rotation_order.length - 1"
              :aria-label="`${person(memberId)?.nickname}下移`"
              :data-testid="`order-down-${category.key}-${memberId}`"
              @click="move(category, index, 1)"
            >
              ↓
            </button>
          </li>
        </ol>
      </fieldset>
      <details class="settings-rules">
        <summary>生效规则</summary>
        <p class="settings-effect">
          自由轮次按地板、厕所分别计算。切换值日方式会重建未完成任务，完成记录保留。按日排班的内容、时间和顺序调整从明天起生效。抬水顺序从下一次轮换生效。
        </p>
      </details>
      <p v-if="error" class="chore-inline-error" role="alert">{{ error }}</p>
      <button
        type="submit"
        class="guest-primary"
        data-testid="settings-save"
        :disabled="saving"
      >
        {{ saving ? "正在保存…" : "保存设置" }}
      </button>
      <router-link class="settings-members" to="/dorm"
        >宿舍成员管理<van-icon name="arrow" aria-hidden="true"
      /></router-link>
    </form>
  </ElasticSheet>
</template>
<style scoped>
.mode-selector {
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  margin-bottom: 12px !important;
}
.mode-description {
  font-size: 16px;
  line-height: 1.6;
  color: #555;
  margin: 16px 0 24px;
}
.category-selector {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 24px;
}
.category-selector button {
  min-height: 44px;
  border: 0;
  border-radius: 12px;
  background: #f3f3f3;
  color: #555;
  font-size: 16px;
  cursor: pointer;
  transition:
    transform 160ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 160ms ease,
    color 160ms ease;
}
.category-selector button[aria-pressed="true"] {
  background: #111;
  color: #fff;
}
.category-selector button:active {
  transform: scale(0.97);
}
@media (prefers-reduced-motion: reduce) {
  .category-selector button {
    transition: none;
  }
}
</style>
<style scoped>
.chore-settings {
  color: #111;
  padding-bottom: 15px;
}
.settings-intro,
.settings-effect {
  font-size: 12px;
  color: #666;
  line-height: 1.8;
  margin: 0 0 22px;
}
fieldset {
  min-width: 0;
  border: 0;
  border-top: 1px solid #ddd;
  margin: 26px 0 0;
  padding: 16px 0 0;
}
legend {
  padding-right: 12px;
  font-size: 18px;
  font-weight: 600;
}
label,
.settings-label {
  display: block;
  font-size: 12px;
  color: #666;
  margin: 20px 0 8px;
}
input:not([type="checkbox"]),
textarea {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 46px;
  padding: 10px 11px;
  border: 1px solid #ddd;
  border-radius: 7px;
  background: #fff;
  color: #111;
  font-size: 16px;
}
textarea {
  resize: vertical;
}
.settings-enabled {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 36px;
  margin: 0 0 12px;
}
input[type="checkbox"] {
  accent-color: #111;
  width: 18px;
  height: 18px;
}
.settings-two-columns {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: 10px;
}
.settings-two-columns input {
  font-size: 14px;
}
.settings-weekdays {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 5px;
}
.settings-weekdays label {
  margin: 0;
  position: relative;
  display: grid;
  place-items: center;
  min-height: 42px;
  border: 1px solid #ddd;
  border-radius: 6px;
  color: #111;
}
.settings-weekdays input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.settings-weekdays label:has(input:checked) {
  color: #fff;
  background: #111;
  border-color: #111;
}
.settings-weekdays label:has(input:focus-visible) {
  outline: 2px solid #666;
  outline-offset: 2px;
}
.settings-order {
  list-style: none;
  margin: 0;
  padding: 0;
}
.settings-order li {
  display: flex;
  gap: 9px;
  align-items: center;
  min-height: 45px;
  border-bottom: 1px solid #eee;
}
.order-position {
  font-size: 11px;
  color: #777;
  width: 14px;
}
.settings-order strong {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.settings-order button {
  background: none;
  border: 0;
  color: #111;
  width: 34px;
  height: 42px;
  font-size: 18px;
}
.settings-order button:disabled {
  color: #ccc;
}
.settings-effect {
  margin-top: 25px;
}
.chore-inline-error {
  padding: 10px 12px;
  border-left: 2px solid #111;
  font-size: 12px;
  color: #555;
  line-height: 1.7;
}
</style>
