import { AckBlinkPattern } from "@/lib/ack-blink-pattern";
import { OpticalSyncTiming } from "@/lib/optical-sync-timing";

export type FlashDetectorPhase = "calibrating" | "warmingUp" | "watching";

export type FlashDetectorOptions = {
  onFlash: () => void;
  onReady?: () => void;
  minJump?: number;
  requiredSpikes?: number;
  spikeWindowMs?: number;
  cooldownMs?: number;
  calibrationFrames?: number;
  warmupMs?: number;
  watchingGraceMs?: number;
  onMetrics?: (metrics: FlashMetrics) => void;
};

export type FlashMetrics = {
  phase: FlashDetectorPhase;
  current: number;
  peak: number;
  baseline: number;
  jump: number;
  spikeCount: number;
  requiredSpikes: number;
  calibrationProgress: number;
  ready: boolean;
  armed: boolean;
  graceRemainingMs: number;
};

type FrameBrightness = {
  average: number;
  peak: number;
};

export class FlashDetector {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stream: MediaStream | null = null;
  private rafId = 0;
  private running = false;
  private phase: FlashDetectorPhase = "calibrating";
  private armed = true;
  private lastFlashAt = 0;
  private warmupStartedAt = 0;
  private watchingGraceUntil = 0;
  private initialWatchComplete = false;
  private lastFrame: FrameBrightness = { average: 0, peak: 0 };
  private readonly sampler = new BrightnessSampler();
  private readonly spikeCounter = new DoubleSpikeCounter();
  private readonly onFlash: () => void;
  private readonly onReady?: () => void;
  private readonly onMetrics?: (metrics: FlashMetrics) => void;
  private readonly cooldownMs: number;
  private readonly warmupMs: number;
  private readonly watchingGraceMs: number;

  constructor(options: FlashDetectorOptions) {
    this.onFlash = options.onFlash;
    this.onReady = options.onReady;
    this.onMetrics = options.onMetrics;
    this.cooldownMs = options.cooldownMs ?? 350;
    this.warmupMs = options.warmupMs ?? 1200;
    this.watchingGraceMs = options.watchingGraceMs ?? 700;
    this.sampler.setRequiredFrames(options.calibrationFrames ?? 45);
    this.spikeCounter.configure(
      options.minJump ?? 18,
      options.requiredSpikes ?? AckBlinkPattern.requiredSpikes,
      options.spikeWindowMs ?? AckBlinkPattern.standard.totalDurationMs + 2500,
    );
    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
    this.canvas = document.createElement("canvas");
    const context = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Canvas 2D unavailable");
    }
    this.ctx = context;
  }

  getVideoElement(): HTMLVideoElement {
    return this.video;
  }

  setMinJump(minJump: number): void {
    this.spikeCounter.setMinJump(minJump);
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.beginCalibration();
    this.loop();
  }

  rearm(): void {
    this.armed = true;
    if (this.initialWatchComplete) {
      this.beginQuickRearm();
      return;
    }
    this.beginCalibration();
  }

  onQrChanged(): void {
    this.rearm();
  }

  async stop(): Promise<void> {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private beginCalibration(): void {
    this.phase = "calibrating";
    this.warmupStartedAt = 0;
    this.watchingGraceUntil = 0;
    this.sampler.reset();
    this.sampler.setRequiredFrames(45);
    this.spikeCounter.reset();
    this.spikeCounter.unlockBaseline();
  }

  private beginWarmup(): void {
    this.phase = "warmingUp";
    this.warmupStartedAt = Date.now();
    this.spikeCounter.reset();
    this.sampler.reset();
    this.sampler.setRequiredFrames(18);
    this.onReady?.();
  }

  private beginWatching(): void {
    this.phase = "watching";
    this.watchingGraceUntil = Date.now() + this.watchingGraceMs;
    this.spikeCounter.reset();
    this.initialWatchComplete = true;
  }

  private beginQuickRearm(): void {
    this.phase = "watching";
    this.lastFlashAt = 0;
    this.watchingGraceUntil = Date.now() + OpticalSyncTiming.quickRearmGraceMs;
    this.spikeCounter.reset();
    this.flushMetrics();
  }

  private loop = (): void => {
    if (!this.running) {
      return;
    }
    this.analyzeFrame();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private analyzeFrame(): void {
    const { videoWidth, videoHeight } = this.video;
    if (!videoWidth || !videoHeight) {
      return;
    }

    this.canvas.width = videoWidth;
    this.canvas.height = videoHeight;
    this.ctx.drawImage(this.video, 0, 0);
    const { data, width, height } = this.ctx.getImageData(0, 0, videoWidth, videoHeight);
    const frame = measureFrame(data, width, height);
    this.lastFrame = frame;

    if (this.phase === "calibrating") {
      this.sampler.add(frame);
      if (this.sampler.isComplete()) {
        this.spikeCounter.lockBaseline(this.sampler.getBaseline());
        this.beginWarmup();
      }
      this.emitMetrics(frame, 0);
      return;
    }

    if (this.phase === "warmingUp") {
      this.sampler.add(frame);
      const elapsed = Date.now() - this.warmupStartedAt;
      if (elapsed >= this.warmupMs && this.sampler.isComplete()) {
        this.spikeCounter.lockBaseline(this.sampler.getBaseline());
        this.beginWatching();
      }
      this.emitMetrics(frame, 0);
      return;
    }

    const inGrace = Date.now() < this.watchingGraceUntil;
    if (inGrace) {
      this.emitMetrics(frame, 0, true);
      return;
    }

    const result = this.spikeCounter.process(frame);
    this.emitMetrics(frame, result.jump, false);

    if (!this.armed || inGrace || !result.complete) {
      return;
    }

    const now = Date.now();
    if (now - this.lastFlashAt < this.cooldownMs) {
      return;
    }

    this.lastFlashAt = now;
    this.armed = false;
    this.spikeCounter.reset();
    this.flushMetrics();
    this.onFlash();
  }

  private flushMetrics(): void {
    const inGrace = Date.now() < this.watchingGraceUntil;
    this.emitMetrics(this.lastFrame, 0, inGrace);
  }

  private emitMetrics(frame: FrameBrightness, jump: number, inGrace = false): void {
    if (!this.onMetrics) {
      return;
    }

    const baseline = this.spikeCounter.getBaseline();
    const ready = this.phase === "watching" && !inGrace;
    const graceRemainingMs = Math.max(0, this.watchingGraceUntil - Date.now());
    this.onMetrics({
      phase: this.phase,
      current: frame.average,
      peak: frame.peak,
      baseline,
      jump,
      spikeCount:
        this.phase === "watching" && this.armed
          ? this.spikeCounter.getSpikeCount()
          : 0,
      requiredSpikes: this.spikeCounter.getRequiredSpikes(),
      calibrationProgress: this.sampler.getProgress(),
      ready,
      armed: this.armed && ready,
      graceRemainingMs: this.phase === "watching" ? graceRemainingMs : 0,
    });
  }
}

class BrightnessSampler {
  private samples: FrameBrightness[] = [];
  private requiredFrames = 60;

  setRequiredFrames(frames: number): void {
    this.requiredFrames = frames;
  }

  add(frame: FrameBrightness): void {
    if (this.samples.length < this.requiredFrames) {
      this.samples.push(frame);
    }
  }

  isComplete(): boolean {
    return this.samples.length >= this.requiredFrames;
  }

  getProgress(): number {
    return Math.min(1, this.samples.length / this.requiredFrames);
  }

  getBaseline(): FrameBrightness {
    const averages = this.samples.map((sample) => sample.average);
    const peaks = this.samples.map((sample) => sample.peak);
    return {
      average: median(averages),
      peak: median(peaks),
    };
  }

  reset(): void {
    this.samples = [];
  }
}

class DoubleSpikeCounter {
  private baseline: FrameBrightness = { average: 0, peak: 0 };
  private locked = false;
  private minJump = 18;
  private requiredSpikes = AckBlinkPattern.requiredSpikes;
  private spikeWindowMs = 2500;
  private spikeCount = 0;
  private windowStart = 0;
  private aboveThreshold = false;
  private lastSpikeAt = 0;

  configure(minJump: number, requiredSpikes: number, spikeWindowMs: number): void {
    this.minJump = minJump;
    this.requiredSpikes = requiredSpikes;
    this.spikeWindowMs = spikeWindowMs;
  }

  setMinJump(minJump: number): void {
    this.minJump = minJump;
  }

  getRequiredSpikes(): number {
    return this.requiredSpikes;
  }

  getSpikeCount(): number {
    return this.spikeCount;
  }

  lockBaseline(baseline: FrameBrightness): void {
    this.baseline = baseline;
    this.locked = true;
  }

  getBaseline(): number {
    return this.baseline.average;
  }

  unlockBaseline(): void {
    this.locked = false;
  }

  reset(): void {
    this.spikeCount = 0;
    this.windowStart = 0;
    this.aboveThreshold = false;
    this.lastSpikeAt = 0;
  }

  process(frame: FrameBrightness): { jump: number; complete: boolean } {
    if (!this.locked) {
      return { jump: 0, complete: false };
    }

    const jump = Math.max(
      frame.average - this.baseline.average,
      frame.peak - this.baseline.peak,
    );
    const now = Date.now();

    if (this.windowStart > 0 && now - this.windowStart > this.spikeWindowMs) {
      const keepPartial = this.spikeCount > 0 && this.spikeCount < this.requiredSpikes;
      if (!keepPartial) {
        this.spikeCount = 0;
        this.windowStart = 0;
      }
    }

    if (jump >= this.minJump) {
      if (!this.aboveThreshold && now - this.lastSpikeAt > 280) {
        this.aboveThreshold = true;
        this.lastSpikeAt = now;
        if (this.windowStart === 0) {
          this.windowStart = now;
        }
        this.spikeCount++;
      }
    } else if (jump < this.minJump * 0.8) {
      this.aboveThreshold = false;
    }

    return {
      jump,
      complete: this.spikeCount >= this.requiredSpikes,
    };
  }
}

function measureFrame(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): FrameBrightness {
  let sum = 0;
  let count = 0;
  let peak = 0;

  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += lum;
      count++;
      if (lum > peak) {
        peak = lum;
      }
    }
  }

  return {
    average: count ? sum / count : 0,
    peak,
  };
}

function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
