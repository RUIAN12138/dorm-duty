<script setup lang="ts">
import { ref, watch } from "vue";
import {
  TimePicker,
  type TimePickerInstance,
  type PickerConfirmEventParams,
} from "vant";
import "vant/es/time-picker/style/index.mjs";
import ElasticSheet from "./ElasticSheet.vue";
import { motionAllowed } from "../interaction/motion";
const props = defineProps<{
  modelValue: string;
  id?: string;
  testId?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const picker = ref<TimePickerInstance>();
const open = ref(false),
  values = ref<string[]>([]);
watch(open, (value) => {
  if (value) values.value = props.modelValue.split(":");
});
function confirm() {
  picker.value?.confirm();
}
function apply({ selectedValues }: PickerConfirmEventParams) {
  emit("update:modelValue", selectedValues.join(":"));
  open.value = false;
}
</script>
<template>
  <div class="time-wheel-field">
    <input
      :id="id"
      type="time"
      :value="modelValue"
      :data-testid="testId"
      required
      aria-label="截止时间，点按打开滚轮"
      @input="
        emit('update:modelValue', ($event.target as HTMLInputElement).value)
      "
      @pointerdown.prevent
      @click.prevent="open = true"
      @keydown.enter.prevent="open = true"
    />
    <button type="button" aria-label="滚轮选择截止时间" @click="open = true">
      <van-icon name="clock-o" />
    </button>
  </div>
  <ElasticSheet v-model="open" title="截止时间" motion="bottom">
    <div class="time-wheel" data-testid="time-wheel">
      <TimePicker
        ref="picker"
        @confirm="apply"
        v-model="values"
        :show-toolbar="false"
        :option-height="48"
        :visible-option-num="5"
        :swipe-duration="motionAllowed() ? 450 : 0"
        :columns-type="['hour', 'minute']"
      />
      <button
        type="button"
        class="guest-primary"
        data-testid="time-wheel-confirm"
        @click="confirm"
      >
        确定
      </button>
    </div>
  </ElasticSheet>
</template>
<style scoped>
.time-wheel-field {
  position: relative;
}
input {
  width: 100%;
  min-width: 0;
  min-height: 46px;
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 10px 44px 10px 12px;
  color: #111;
  background: #fff;
  font: inherit;
  font-size: 16px;
}
.time-wheel-field > button {
  position: absolute;
  right: 3px;
  top: 3px;
  width: 40px;
  height: 40px;
  border: 0;
  background: #fff;
  color: #777;
  font-size: 20px;
  border-radius: 10px;
  cursor: pointer;
}
.time-wheel-field > button:active {
  transform: scale(0.96);
}
.time-wheel :deep(.van-picker) {
  --van-picker-confirm-action-color: #111;
  --van-picker-option-font-size: 26px;
  --van-picker-option-text-color: #111;
  --van-picker-background: transparent;
  --van-picker-mask-color:
    linear-gradient(180deg, #ffff, #fff5), linear-gradient(0deg, #ffff, #fff5);
}
.time-wheel :deep(.van-picker__frame) {
  border-radius: 16px;
  background: #00000004;
  inset-inline: 8px;
}
.time-wheel :deep(.van-picker-column__item) {
  font-variant-numeric: tabular-nums;
  font-weight: 550;
}
.time-wheel .guest-primary {
  margin-top: 20px;
}
</style>
