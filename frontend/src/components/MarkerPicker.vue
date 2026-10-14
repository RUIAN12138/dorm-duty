<script setup lang="ts">
import { computed, ref } from "vue";
import marks from "../data/member-marks.json";
import MemberMark from "./MemberMark.vue";
const props = withDefaults(
  defineProps<{
    modelValue: string;
    occupied?: string[];
    disabled?: boolean;
    title?: string;
  }>(),
  { occupied: () => [], title: "你的标记" },
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const expanded = ref(false);
const shown = computed(() => (expanded.value ? marks : marks.slice(0, 16)));
const selected = computed(() =>
  marks.find((item) => item.id === props.modelValue),
);
</script>
<template>
  <fieldset class="marker-picker" :disabled="disabled">
    <legend>{{ title }}</legend>
    <div class="marker-grid" role="group" aria-label="个人像素标记">
      <button
        v-for="mark in shown"
        :key="mark.id"
        type="button"
        :disabled="occupied.includes(mark.id) && modelValue !== mark.id"
        :class="{ selected: modelValue === mark.id }"
        :aria-pressed="modelValue === mark.id"
        :aria-label="`${mark.name}${occupied.includes(mark.id) && modelValue !== mark.id ? '，室友已选择' : ''}`"
        :data-testid="`marker-${mark.id}`"
        @click="emit('update:modelValue', mark.id)"
      >
        <MemberMark :id="mark.id" :size="28" />
      </button>
    </div>
    <div class="marker-caption">
      <span>{{ selected?.name || "请选择一个图案" }}</span
      ><button type="button" @click="expanded = !expanded">
        {{ expanded ? "收起图案" : "更多图案" }}
      </button>
    </div>
  </fieldset>
</template>
<style scoped>
.marker-picker {
  border: 0;
  margin: 26px 0 0;
  padding: 0;
  min-width: 0;
}
legend {
  font-size: 15px;
  font-weight: 600;
}
p {
  color: #666;
  font-size: 11px;
  line-height: 1.7;
  margin: 6px 0 14px;
}
.marker-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 4px;
}
.marker-grid button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  aspect-ratio: 1;
  min-height: 44px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: #f7f7f7;
}
.marker-grid button.selected {
  background: #111;
  border-color: #111;
}
.marker-grid button:disabled {
  opacity: 0.25;
}
.marker-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  color: #666;
  margin-top: 6px;
}
.marker-caption button {
  border: 0;
  background: none;
  color: #555;
  min-height: 44px;
  padding: 8px 0 8px 12px;
}
@media (max-width: 350px) {
  .marker-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}
</style>
