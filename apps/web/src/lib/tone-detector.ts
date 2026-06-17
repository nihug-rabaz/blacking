import { AckAudioSignal } from "@blacking/protocol";
import { OpticalSyncTiming } from "@/lib/optical-sync-timing";

export type ToneDetectorPhase = "calibrating" | "watching";

export type ToneDetectorOptions = {
  onAck: () => void;
  onMetrics?: (metrics: ToneMetrics) => void;
  snrMinRatio?: number;
};

export type ToneMetrics = {
  phase: ToneDetectorPhase;
  toneCount: number;
  requiredTones: number;
  targetHz: number;
  targetPower: number;
  noisePower: number;
  snr: number;
  calibrationProgress: number;
  ready: boolean;
  armed: boolean;
  graceRemainingMs: number;
};

export class ToneDetector {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private buffer: Float32Array<ArrayBuffer> = new Float32Array(0);
  private rafId = 0;
  private running = false;
  private phase: ToneDetectorPhase = "calibrating";
  private armed = true;
  private lastAckAt = 0;
  private watchingGraceUntil = 0;
  private initialWatchComplete = false;
  private readonly sequence = new ToneSequenceCounter();
  private readonly noiseSampler = new NoiseSampler();
  private readonly onAck: () => void;
  private readonly onMetrics?: (metrics: ToneMetrics) => void;
  private readonly snrMinRatio: number;

  constructor(options: ToneDetectorOptions) {
    this.onAck = options.onAck;
    this.onMetrics = options.onMetrics;
    this.snrMinRatio = options.snrMinRatio ?? AckAudioSignal.snrMinRatio;
    this.sequence.configure(
      [...AckAudioSignal.tonesHz],
      AckAudioSignal.requiredDetections,
      this.snrMinRatio,
      AckAudioSignal.absoluteMinPower,
    );
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    this.context = new AudioContext();
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    this.source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 8192;
    this.analyser.smoothingTimeConstant = 0;
    this.source.connect(this.analyser);
    this.buffer = new Float32Array(this.analyser.fftSize);
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
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== "closed") {
      await this.context.close();
    }
    this.source = null;
    this.analyser = null;
    this.stream = null;
    this.context = null;
  }

  private beginCalibration(): void {
    this.phase = "calibrating";
    this.watchingGraceUntil = 0;
    this.noiseSampler.reset();
    this.sequence.reset();
  }

  private beginWatching(): void {
    this.phase = "watching";
    this.watchingGraceUntil = Date.now() + 500;
    this.sequence.reset();
    this.initialWatchComplete = true;
  }

  private beginQuickRearm(): void {
    this.phase = "watching";
    this.lastAckAt = 0;
    this.watchingGraceUntil = Date.now() + OpticalSyncTiming.quickRearmGraceMs;
    this.sequence.reset();
    this.flushMetrics();
  }

  private loop = (): void => {
    if (!this.running || !this.analyser || !this.context) {
      return;
    }
    this.analyseFrame();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private analyseFrame(): void {
    if (!this.analyser || !this.context) {
      return;
    }
    this.analyser.getFloatTimeDomainData(this.buffer);
    const sampleRate = this.context.sampleRate;
    const tonePowers = AckAudioSignal.tonesHz.map((hz) => goertzelPower(this.buffer, sampleRate, hz));
    const noisePower = Math.max(
      goertzelPower(this.buffer, sampleRate, 880),
      goertzelPower(this.buffer, sampleRate, 1200),
      goertzelPower(this.buffer, sampleRate, 3000),
      0.000001,
    );

    if (this.phase === "calibrating") {
      this.noiseSampler.add(noisePower);
      if (this.noiseSampler.isComplete()) {
        this.sequence.setNoiseFloor(this.noiseSampler.getMedian());
        this.beginWatching();
      }
      this.emitMetrics(tonePowers, noisePower, true);
      return;
    }

    const inGrace = Date.now() < this.watchingGraceUntil;
    if (inGrace) {
      this.emitMetrics(tonePowers, noisePower, true);
      return;
    }

    const result = this.sequence.process(tonePowers, noisePower);
    this.emitMetrics(tonePowers, noisePower, false);

    if (!this.armed || !result.complete) {
      return;
    }

    const now = Date.now();
    if (now - this.lastAckAt < 350) {
      return;
    }

    this.lastAckAt = now;
    this.armed = false;
    this.sequence.reset();
    this.flushMetrics();
    this.onAck();
  }

  private flushMetrics(): void {
    if (!this.onMetrics) {
      return;
    }
    const inGrace = Date.now() < this.watchingGraceUntil;
    this.emitMetrics([0, 0], this.sequence.getNoiseFloor(), inGrace);
  }

  private emitMetrics(tonePowers: number[], noisePower: number, inGrace: boolean): void {
    if (!this.onMetrics) {
      return;
    }
    const ready = this.phase === "watching" && !inGrace;
    const targetIndex = Math.min(this.sequence.getStep(), AckAudioSignal.tonesHz.length - 1);
    const targetHz = AckAudioSignal.tonesHz[targetIndex];
    const targetPower = tonePowers[targetIndex] ?? 0;
    const snr = targetPower / Math.max(noisePower, 0.000001);
    this.onMetrics({
      phase: this.phase,
      toneCount: this.phase === "watching" && this.armed ? this.sequence.getToneCount() : 0,
      requiredTones: AckAudioSignal.requiredDetections,
      targetHz,
      targetPower,
      noisePower,
      snr,
      calibrationProgress: this.noiseSampler.getProgress(),
      ready,
      armed: this.armed && ready,
      graceRemainingMs: Math.max(0, this.watchingGraceUntil - Date.now()),
    });
  }
}

class NoiseSampler {
  private samples: number[] = [];
  private readonly required = 40;

  add(value: number): void {
    if (this.samples.length < this.required) {
      this.samples.push(value);
    }
  }

  isComplete(): boolean {
    return this.samples.length >= this.required;
  }

  getProgress(): number {
    return Math.min(1, this.samples.length / this.required);
  }

  getMedian(): number {
    if (!this.samples.length) {
      return 0.0001;
    }
    const sorted = [...this.samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  reset(): void {
    this.samples = [];
  }
}

class ToneSequenceCounter {
  private frequencies: number[] = [];
  private requiredTones = 2;
  private snrMinRatio = 11;
  private absoluteMinPower = 0.0008;
  private noiseFloor = 0.0001;
  private step = 0;
  private toneCount = 0;
  private aboveThreshold = false;
  private lastToneAt = 0;

  configure(
    frequencies: number[],
    requiredTones: number,
    snrMinRatio: number,
    absoluteMinPower: number,
  ): void {
    this.frequencies = frequencies;
    this.requiredTones = requiredTones;
    this.snrMinRatio = snrMinRatio;
    this.absoluteMinPower = absoluteMinPower;
  }

  setNoiseFloor(floor: number): void {
    this.noiseFloor = Math.max(floor, 0.00005);
  }

  getNoiseFloor(): number {
    return this.noiseFloor;
  }

  getStep(): number {
    return this.step;
  }

  getToneCount(): number {
    return this.toneCount;
  }

  reset(): void {
    this.step = 0;
    this.toneCount = 0;
    this.aboveThreshold = false;
    this.lastToneAt = 0;
  }

  process(tonePowers: number[], noisePower: number): { complete: boolean } {
    const now = Date.now();
    const expectedHz = this.frequencies[this.step];
    if (!expectedHz) {
      return { complete: this.toneCount >= this.requiredTones };
    }

    const index = this.frequencies.indexOf(expectedHz);
    const power = tonePowers[index] ?? 0;
    const threshold = Math.max(this.noiseFloor * this.snrMinRatio, noisePower * this.snrMinRatio);
    const detected = power >= threshold && power >= this.absoluteMinPower;

    if (detected) {
      if (!this.aboveThreshold && now - this.lastToneAt > 120) {
        this.aboveThreshold = true;
        this.lastToneAt = now;
        this.toneCount++;
        this.step++;
      }
    } else if (power < threshold * 0.55) {
      this.aboveThreshold = false;
    }

    return { complete: this.toneCount >= this.requiredTones };
  }
}

function goertzelPower(samples: Float32Array<ArrayBuffer>, sampleRate: number, frequencyHz: number): number {
  const bin = Math.round(0.5 + (samples.length * frequencyHz) / sampleRate);
  const omega = (2 * Math.PI * bin) / samples.length;
  const coeff = 2 * Math.cos(omega);
  let prev = 0;
  let prev2 = 0;
  for (let index = 0; index < samples.length; index++) {
    const next = samples[index] + coeff * prev - prev2;
    prev2 = prev;
    prev = next;
  }
  return prev2 * prev2 + prev * prev - coeff * prev * prev2;
}
