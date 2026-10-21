// Browser recording stays in memory. A bounded, single-channel 16 kHz WAV is
// sent to our authenticated endpoint; no speech is sent until recording stops.
export function pcmWav(samples: Float32Array, sampleRate: number) {
  const count = Math.min(
    480000,
    Math.floor((samples.length * 16000) / sampleRate),
  );
  const buffer = new ArrayBuffer(44 + count * 2),
    view = new DataView(buffer);
  const word = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++)
      view.setUint8(offset + i, s.charCodeAt(i));
  };
  word(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * sampleRate) / 16000),
      end = Math.min(
        samples.length,
        Math.max(start + 1, Math.floor(((i + 1) * sampleRate) / 16000)),
      );
    let v = 0;
    for (let j = start; j < end; j++) v += samples[j];
    v = Math.max(-1, Math.min(1, v / (end - start)));
    view.setInt16(44 + i * 2, v < 0 ? v * 32768 : v * 32767, true);
  }
  return buffer;
}
export function audioBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function voiceSupported() {
  return (
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    typeof AudioContext !== "undefined"
  );
}
export function createVoiceRecorder() {
  let stream: MediaStream | undefined,
    recorder: MediaRecorder | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    epoch = 0,
    context: AudioContext | undefined;
  function cancel() {
    epoch++;
    clearTimeout(timer);
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    recorder = undefined;
    stream?.getTracks().forEach((t) => t.stop());
    stream = undefined;
    void context?.close().catch(() => {});
    context = undefined;
  }
  async function start(
    onReady: (wav: ArrayBuffer) => void,
    onError: (message: string) => void,
  ) {
    cancel();
    const generation = epoch;
    let chunks: Blob[] = [];
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (epoch !== generation) {
        acquired.getTracks().forEach((t) => t.stop());
        return false;
      }
      stream = acquired;
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onerror = () => {
        if (epoch === generation) {
          cancel();
          onError("录音中断，请重试");
        }
      };
      recorder.onstop = async () => {
        clearTimeout(timer);
        acquired.getTracks().forEach((t) => t.stop());
        if (epoch !== generation) return;
        let decodingContext: AudioContext | undefined;
        const mimeType = recorder?.mimeType;
        try {
          decodingContext = new AudioContext();
          context = decodingContext;
          const decoded = await decodingContext.decodeAudioData(
            await new Blob(chunks, { type: mimeType }).arrayBuffer(),
          );
          if (epoch !== generation) return;
          if (decoded.duration > 30.5) throw Error("录音过长");
          const samples = new Float32Array(decoded.length);
          for (let c = 0; c < decoded.numberOfChannels; c++) {
            const channel = decoded.getChannelData(c);
            for (let i = 0; i < samples.length; i++)
              samples[i]! += channel[i]! / decoded.numberOfChannels;
          }
          const wav = pcmWav(samples, decoded.sampleRate);
          if (epoch === generation) onReady(wav);
        } catch {
          if (epoch === generation) onError("语音没录清，请重新录制");
        } finally {
          chunks = [];
          void decodingContext?.close().catch(() => {});
          if (context === decodingContext) context = undefined;
        }
      };
      recorder.start(250);
      timer = setTimeout(() => {
        if (epoch === generation && recorder?.state === "recording")
          recorder.stop();
      }, 29000);
      return true;
    } catch {
      if (epoch === generation) {
        cancel();
        onError("无法使用麦克风，请检查权限");
      }
      return false;
    }
  }
  return {
    start,
    cancel,
    stop() {
      clearTimeout(timer);
      if (recorder?.state === "recording") recorder.stop();
    },
  };
}
