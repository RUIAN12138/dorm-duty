<template><span class="galaxy-spinner" aria-hidden="true" /></template>
<style scoped>
/* Adapted from Uiverse.io by mrhyddenn: massive-newt-28 (MIT). */
.galaxy-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
}
@media (prefers-reduced-motion: no-preference) {
  .galaxy-spinner {
    animation: galaxy-spin 0.8s linear infinite;
  }
  @keyframes galaxy-spin {
    to {
      transform: rotate(360deg);
    }
  }
}
</style>
