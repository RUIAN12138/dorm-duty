<script setup lang="ts">
withDefaults(defineProps<{ title: string; text?: string; icon?: string }>(), {
  icon: "flower-o",
});
</script>
<template>
  <div class="empty-state">
    <van-icon aria-hidden="true" :name="icon" size="38" />
    <h3>{{ title }}</h3>
    <p v-if="text">{{ text }}</p>
    <slot />
  </div>
</template>
