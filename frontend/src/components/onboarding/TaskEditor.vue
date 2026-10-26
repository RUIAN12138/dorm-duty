<script setup lang="ts">
import type { DraftTask } from '../../interaction/dormDraft';
defineProps<{task:DraftTask}>();
</script>
<template><div class="task-editor wizard-fields">
<label data-enter>任务名称<input v-model="task.name" maxlength="32" autocomplete="off" placeholder="给这件事起个名字"/></label>
<label data-enter>简短说明 <span>可选</span><textarea v-model="task.content" rows="2" maxlength="500" placeholder="一句话就好"/></label>
</div></template>
<style scoped>
.task-editor{display:grid;gap:32px}.task-editor label{display:grid;gap:12px;font-size:14px;color:var(--muted);min-width:0}.task-editor label>span{font-size:12px}.task-editor input,.task-editor textarea{box-sizing:border-box;width:100%;min-width:0;max-width:100%;border:1px solid var(--line);border-radius:20px;padding:18px;color:var(--ink);background:color-mix(in srgb,var(--canvas) 94%,transparent);font:inherit;font-size:18px;line-height:1.5;resize:none;transition:transform 220ms var(--ui-ease-out),box-shadow 220ms}.task-editor input:focus,.task-editor textarea:focus{transform:scale(1.01);box-shadow:inset 0 1px 2px #ffffff50,0 0 0 2px color-mix(in srgb,var(--ink) 12%,transparent);outline:none}.task-editor :focus-visible{outline:2px solid var(--ink);outline-offset:4px}@media(prefers-reduced-motion:reduce){*{transition:none!important;transform:none!important}}
</style>
