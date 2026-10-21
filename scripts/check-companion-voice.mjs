// Exercise actual recorder cancellation and PCM transport; not a device microphone test.
import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
const bundle = await build({
  entryPoints: ["frontend/src/interaction/companionVoice.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { pcmWav, audioBase64, createVoiceRecorder } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const checks = [];
const check = (v, name) => {
  assert(v, name);
  checks.push(name);
};
const pcm = pcmWav(Float32Array.from([-2, -0.5, 0, 0.5, 2]), 16000),
  v = new DataView(pcm);
check(
  v.getUint32(24, true) === 16000 &&
    v.getUint16(22, true) === 1 &&
    v.getUint16(34, true) === 16,
  "transport is mono 16kHz PCM16",
);
check(
  v.getInt16(44, true) === -32768 && v.getInt16(52, true) === 32767,
  "PCM samples clamp safely at both amplitudes",
);
check(
  new Uint8Array(pcmWav(new Float32Array(16000 * 31), 16000)).length === 960044,
  "transport truncates at 30 seconds",
);
check(
  Buffer.from(audioBase64(pcm), "base64").equals(Buffer.from(pcm)),
  "audio base64 preserves WAV bytes",
);
let stopped = 0,
  releasePermission,
  decodeResolve,
  closed = [];
const errors = [],
  outputs = [];
const stream = { getTracks: () => [{ stop: () => stopped++ }] };
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    mediaDevices: {
      getUserMedia: () => new Promise((r) => (releasePermission = r)),
    },
  },
});
class Recorder {
  constructor() {
    this.state = "inactive";
    this.mimeType = "audio/mp4";
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["fixture"]) });
    this.onstop?.();
  }
}
globalThis.MediaRecorder = Recorder;
class Context {
  constructor() {
    this.id = closed.length;
    this.state = "running";
  }
  decodeAudioData() {
    return new Promise((r) => (decodeResolve = r));
  }
  close() {
    closed.push(this);
    this.state = "closed";
    return Promise.resolve();
  }
}
globalThis.AudioContext = Context;
const r = createVoiceRecorder();
const pending = r.start(
  (w) => outputs.push(w),
  (e) => errors.push(e),
);
r.cancel();
releasePermission(stream);
await pending;
check(
  stopped === 1 && outputs.length === 0,
  "cancel during permission prompt stops later-acquired microphone",
);
navigator.mediaDevices.getUserMedia = async () => stream;
await r.start(
  (w) => outputs.push(w),
  (e) => errors.push(e),
);
r.stop();
await new Promise((r) => setTimeout(r, 0));
const oldDecode = decodeResolve;
r.cancel();
await r.start(
  (w) => outputs.push(w),
  (e) => errors.push(e),
);
r.stop();
await new Promise((r) => setTimeout(r, 0));
const newDecode = decodeResolve;
const decoded = {
  duration: 1,
  length: 16000,
  sampleRate: 16000,
  numberOfChannels: 1,
  getChannelData: () => new Float32Array(16000),
};
oldDecode(decoded);
await new Promise((r) => setTimeout(r, 0));
check(outputs.length === 0, "cancelled decode cannot emit a stale transcript");
newDecode(decoded);
await new Promise((r) => setTimeout(r, 0));
check(
  outputs.length === 1 && closed.every((c) => c.state === "closed"),
  "old decode cleanup does not close the replacement recorder context",
);
r.cancel();
navigator.mediaDevices.getUserMedia = async () => {
  throw Error("Permission denied");
};
await r.start(
  (w) => outputs.push(w),
  (e) => errors.push(e),
);
check(
  errors.length === 1 && errors[0].includes("权限"),
  "permission denial yields a recoverable error",
);
console.log(
  JSON.stringify({ status: "passed", checks: checks.length, items: checks }),
);
