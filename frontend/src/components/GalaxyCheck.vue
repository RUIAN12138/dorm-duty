<template>
  <svg class="galaxy-check" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path d="M4 14l8 7L24 7" />
  </svg>
</template>
<style scoped>
/* Adapted from Uiverse.io by Shoh2008: perfect-mouse-3 (MIT). */
.galaxy-check {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.galaxy-check path {
  stroke-dasharray: 30 31;
  stroke-dashoffset: 0;
}
@media (prefers-reduced-motion: no-preference) {
  .galaxy-check path {
    animation: galaxy-check-in 220ms var(--ui-ease-out);
  }
  @keyframes galaxy-check-in {
    from {
      stroke-dashoffset: 31;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
}
</style>
