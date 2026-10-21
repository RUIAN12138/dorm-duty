<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { motionAllowed } from "../interaction/motion";
import {
  glassGeometry,
  glassVertex,
  glassFragment,
  nativeGlassClip,
  type NativeLabelBox,
  GLASS_OVERFLOW,
} from "../interaction/liquidGlass";
const props = defineProps<{
  position: number;
  pressed: boolean;
  dragging: boolean;
  moving: boolean;
  active: number;
}>();
const emit = defineEmits<{ ready: [value: boolean] }>();
const canvas = ref<HTMLCanvasElement>(),
  enabled = ref(false);
function ready(value: boolean) {
  enabled.value = value;
  if (!value) clearClips();
  emit("ready", value);
}
let gl: WebGLRenderingContext | null = null,
  program: WebGLProgram | null = null;
let texture: WebGLTexture | null = null,
  buffer: WebGLBuffer | null = null;
let vertex: WebGLShader | null = null,
  fragment: WebGLShader | null = null;
let observer: ResizeObserver | undefined,
  frame = 0,
  dirty = true,
  dead = false,
  lost = false;
let pressure = 0,
  pressureSpeed = 0,
  wobble = 0,
  wobbleSpeed = 0,
  last = 0,
  lastPosition = props.position,
  velocity = 0;
let parent: HTMLElement | null = null;
let backdrop = [1, 1, 1],
  tint = [1, 1, 1, 0.1],
  sourceRefreshUntil = 0;
const source = document.createElement("canvas");
const nativeLabels = new Map<HTMLElement, NativeLabelBox>();
function clearClips() {
  nativeLabels.forEach((_, el) => el.style.removeProperty("clip-path"));
}
const transparency = matchMedia("(prefers-reduced-transparency: reduce)");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const uniforms: Record<string, WebGLUniformLocation | null> = {};
function shader(type: number, text: string) {
  const value = gl!.createShader(type);
  if (!value) throw Error("shader unavailable");
  gl!.shaderSource(value, text);
  gl!.compileShader(value);
  if (!gl!.getShaderParameter(value, gl!.COMPILE_STATUS)) {
    gl!.deleteShader(value);
    throw Error("glass shader compilation failed");
  }
  return value;
}
function paintSource(width: number, height: number, dpr: number) {
  const ctx = source.getContext("2d");
  if (!ctx || !parent || !gl) return;
  source.width = Math.round(width * dpr);
  source.height = Math.round(height * dpr);
  // Resolve the translucent navigation against its actual page base once per
  // source refresh; the shader uses it for per-wavelength transmittance.
  ctx.fillStyle = getComputedStyle(
    document.querySelector(".app-stage") || document.documentElement,
  ).backgroundColor;
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = getComputedStyle(parent).backgroundColor;
  ctx.fillRect(0, 0, 1, 1);
  const pixel = ctx.getImageData(0, 0, 1, 1).data;
  backdrop = [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255];
  ctx.clearRect(0, 0, source.width, source.height);
  ctx.fillStyle =
    getComputedStyle(parent).getPropertyValue("--glass-lens-surface").trim() ||
    "rgba(255,255,255,0.1)";
  ctx.fillRect(0, 0, 1, 1);
  const tintPixel = ctx.getImageData(0, 0, 1, 1).data;
  tint = [...tintPixel].map((value) => value / 255);
  ctx.clearRect(0, 0, source.width, source.height);
  ctx.scale(source.width / width, source.height / height);
  const bounds = canvas.value!.getBoundingClientRect();
  clearClips();
  nativeLabels.clear();
  for (const link of parent.querySelectorAll("a, [data-glass-item]")) {
    const text = link.querySelector(".nav-native-caption"),
      icon = link.querySelector("svg");
    const native = link.querySelector<HTMLElement>(".nav-native-content");
    if (native) {
      const rect = native.getBoundingClientRect();
      nativeLabels.set(native, {
        left: rect.left - bounds.left,
        top: rect.top - bounds.top,
        width: rect.width,
        height: rect.height,
      });
    }
    const style = getComputedStyle(link);
    if (text) {
      const rect = text.getBoundingClientRect();
      const font = getComputedStyle(text);
      ctx.fillStyle = style.color;
      ctx.font = `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        text.textContent || "",
        rect.left - bounds.left + rect.width / 2,
        rect.top - bounds.top + rect.height / 2 + 0.5,
      );
    }
    if (icon) {
      const rect = icon.getBoundingClientRect();
      ctx.save();
      ctx.translate(rect.left - bounds.left, rect.top - bounds.top);
      ctx.scale(rect.width / 24, rect.height / 24);
      ctx.strokeStyle = style.color;
      ctx.lineWidth = link.classList.contains("active") ? 2.2 : 1.6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const path of icon.querySelectorAll("path"))
        ctx.stroke(new Path2D(path.getAttribute("d") || ""));
      for (const rect of icon.querySelectorAll("rect")) {
        ctx.beginPath();
        const x = Number(rect.getAttribute("x")),
          y = Number(rect.getAttribute("y")),
          w = Number(rect.getAttribute("width")),
          h = Number(rect.getAttribute("height")),
          r = Number(rect.getAttribute("rx"));
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
        else ctx.rect(x, y, w, h);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  dirty = false;
}
function draw(now: number) {
  frame = 0;
  if (
    dead ||
    lost ||
    transparency.matches ||
    document.hidden ||
    !gl ||
    !program ||
    !canvas.value ||
    !parent
  )
    return;
  try {
    const bounds = canvas.value.getBoundingClientRect(),
      width = bounds.width,
      height = bounds.height;
    if (!width || !height) return;
    const dpr = Math.min(devicePixelRatio || 1, 3),
      w = Math.round(width * dpr),
      h = Math.round(height * dpr);
    if (canvas.value.width !== w || canvas.value.height !== h) {
      canvas.value.width = w;
      canvas.value.height = h;
      dirty = true;
    }
    const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000 || 0.016));
    last = now;
    const animate = motionAllowed() && !reduced.matches;
    const desired = animate && (props.pressed || props.dragging) ? 1 : 0;
    pressureSpeed += ((desired - pressure) * 420 - pressureSpeed * 27) * dt;
    pressure += pressureSpeed * dt;
    velocity +=
      ((props.position - lastPosition) / dt - velocity) *
      (1 - Math.exp(-18 * dt));
    lastPosition = props.position;
    if (animate) {
      wobbleSpeed += (-195 * wobble - 12 * wobbleSpeed) * dt;
      wobble += wobbleSpeed * dt;
    } else {
      pressure = 0;
      pressureSpeed = 0;
      wobble = 0;
      wobbleSpeed = 0;
      velocity = 0;
    }
    const geometry = glassGeometry(
      width - GLASS_OVERFLOW * 2,
      height - GLASS_OVERFLOW * 2,
      props.position,
      Math.max(0, Math.min(1.08, pressure)),
      velocity,
      Math.max(-0.095, Math.min(0.095, wobble)),
    );
    const lens = {
      ...geometry,
      x: geometry.x + GLASS_OVERFLOW,
      y: geometry.y + GLASS_OVERFLOW,
    };
    gl.viewport(0, 0, w, h);
    gl.useProgram(program);
    if (now < sourceRefreshUntil) dirty = true;
    if (dirty) paintSource(width, height, dpr);
    gl.uniform3f(uniforms.u_backdrop!, backdrop[0], backdrop[1], backdrop[2]);
    gl.uniform4f(uniforms.u_tint!, tint[0], tint[1], tint[2], tint[3]);
    gl.uniform2f(uniforms.u_size!, width, height);
    gl.uniform4f(uniforms.u_lens!, lens.x, lens.y, lens.width, lens.height);
    gl.uniform1f(uniforms.u_zoom!, 1 + Math.max(0, pressure) * 0.1);
    gl.uniform1f(
      uniforms.u_energy!,
      Math.min(
        1,
        pressure * 0.6 + Math.abs(velocity) * 0.06 + Math.abs(wobble) * 8,
      ),
    );
    gl.uniform1f(uniforms.u_time!, (now % 60000) / 1000);
    nativeLabels.forEach((box, el) => {
      el.style.clipPath = nativeGlassClip(box, lens);
    });
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ready(true);
    if (
      now < sourceRefreshUntil ||
      (animate &&
        (props.moving ||
          props.dragging ||
          Math.abs(pressure - desired) > 0.001 ||
          Math.abs(pressureSpeed) > 0.01 ||
          Math.abs(wobble) > 0.0002 ||
          Math.abs(wobbleSpeed) > 0.002 ||
          Math.abs(velocity) > 0.015))
    )
      request();
  } catch {
    ready(false);
    lost = true;
  }
}
function request() {
  if (!frame && !dead && !lost && !transparency.matches && !document.hidden)
    frame = requestAnimationFrame(draw);
}
watch(() => props.position, request);
watch(
  () => props.active,
  () => {
    sourceRefreshUntil = motionAllowed() ? performance.now() + 220 : 0;
    dirty = true;
    request();
  },
  { flush: "post" },
);
watch(
  () => [props.pressed, props.dragging],
  () => {
    dirty = true;
    request();
  },
  { flush: "post" },
);
watch(
  () => props.moving,
  (moving, was) => {
    if (was && !moving && !props.dragging) {
      wobbleSpeed -= 1.65;
    }
    request();
  },
);
function preference() {
  pressure = pressureSpeed = wobble = wobbleSpeed = velocity = 0;
  lastPosition = props.position;
  if (transparency.matches) {
    cancelAnimationFrame(frame);
    frame = 0;
    ready(false);
  } else {
    last = 0;
    dirty = true;
    if (!gl) initialize();
    request();
  }
}
function themeChanged() {
  sourceRefreshUntil = motionAllowed() ? performance.now() + 220 : 0;
  dirty = true;
  request();
}
function snapshotTheme() {
  cancelAnimationFrame(frame);
  frame = 0;
  dirty = true;
  draw(performance.now());
}
function visibility() {
  if (document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
    pressure = pressureSpeed = wobble = wobbleSpeed = velocity = 0;
    lastPosition = props.position;
    last = 0;
  } else {
    dirty = true;
    request();
  }
}
function contextLost(event: Event) {
  event.preventDefault();
  lost = true;
  pressure = pressureSpeed = wobble = wobbleSpeed = velocity = 0;
  lastPosition = props.position;
  cancelAnimationFrame(frame);
  frame = 0;
  ready(false);
}
function contextRestored() {
  lost = false;
  dispose();
  initialize();
}
function dispose() {
  if (!gl) return;
  gl.deleteTexture(texture);
  gl.deleteBuffer(buffer);
  gl.deleteProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
}
function initialize() {
  try {
    if (
      !canvas.value ||
      transparency.matches ||
      !CSS.supports("clip-path", "polygon(evenodd,0% 0%,100% 0%,100% 100%)")
    )
      return;
    gl = canvas.value.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "low-power",
    });
    if (!gl) return;
    vertex = shader(gl.VERTEX_SHADER, glassVertex);
    fragment = shader(gl.FRAGMENT_SHADER, glassFragment);
    program = gl.createProgram();
    if (!program) throw Error("program unavailable");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error("glass shader linking failed");
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const attribute = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.uniform1i(gl.getUniformLocation(program, "u_text"), 0);
    for (const name of [
      "u_size",
      "u_lens",
      "u_energy",
      "u_zoom",
      "u_time",
      "u_backdrop",
      "u_tint",
    ])
      uniforms[name] = gl.getUniformLocation(program, name);
    dirty = true;
    request();
  } catch {
    dispose();
    gl = null;
    ready(false);
  }
}
onMounted(() => {
  parent = canvas.value?.parentElement || null;
  initialize();
  observer = new ResizeObserver(() => {
    dirty = true;
    request();
  });
  if (parent) observer.observe(parent);
  canvas.value?.addEventListener("webglcontextlost", contextLost);
  canvas.value?.addEventListener("webglcontextrestored", contextRestored);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("ui-motion-change", preference);
  window.addEventListener("ui-theme-change", themeChanged);
  window.addEventListener("ui-theme-snapshot", snapshotTheme);
  transparency.addEventListener("change", preference);
  reduced.addEventListener("change", preference);
  void document.fonts.ready.then(() => {
    if (!dead) {
      dirty = true;
      request();
    }
  });
});
onBeforeUnmount(() => {
  clearClips();
  nativeLabels.clear();
  dead = true;
  cancelAnimationFrame(frame);
  observer?.disconnect();
  dispose();
  canvas.value?.removeEventListener("webglcontextlost", contextLost);
  canvas.value?.removeEventListener("webglcontextrestored", contextRestored);
  document.removeEventListener("visibilitychange", visibility);
  window.removeEventListener("ui-motion-change", preference);
  window.removeEventListener("ui-theme-change", themeChanged);
  window.removeEventListener("ui-theme-snapshot", snapshotTheme);
  transparency.removeEventListener("change", preference);
  reduced.removeEventListener("change", preference);
});
</script>
<template>
  <canvas
    ref="canvas"
    class="liquid-nav-optics"
    :style="{
      opacity: enabled ? 1 : 0,
      '--glass-overflow': `${GLASS_OVERFLOW}px`,
    }"
    aria-hidden="true"
  />
</template>
<style scoped>
.liquid-nav-optics {
  position: absolute;
  inset: calc(-1 * var(--glass-overflow));
  width: calc(100% + 2 * var(--glass-overflow));
  height: calc(100% + 2 * var(--glass-overflow));
  pointer-events: none;
  z-index: 2;
}
</style>
