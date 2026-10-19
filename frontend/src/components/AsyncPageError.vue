<script setup lang="ts">
function reload() {
  window.location.reload();
}
</script>
<template>
  <div class="async-page-error" role="alert">
    <p>页面资源加载失败，请联网后刷新重试。</p>
    <button type="button" class="guest-primary" @click="reload">
      刷新页面
    </button>
  </div>
</template>
<style scoped>
.async-page-error {
  padding: 32px 0;
  font-size: 16px;
  line-height: 1.6;
}
</style>
