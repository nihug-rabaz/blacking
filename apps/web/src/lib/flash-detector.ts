export type FlashDetectorOptions = {
  onFlash: () => void;
  thresholdMultiplier?: number;
  cooldownMs?: number;
  onMetrics?: (metrics: FlashMetrics) => void;
};

export type FlashMetrics = {
  luminance: number;
  peak: number;
  baseline: number;
  ratio: number;
  armed: boolean;
  spikes: number;
};

export class FlashDetector {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stream: MediaStream | null = null;
  private rafId = 0;
  private running = false;
  private baseline = 0;
  private calibrating = true;
  private calibrationFrames = 0;
  private lastFlashAt = 0;
  private armed = true;
  private spikeCount = 0;
  private spikeWindowStart = 0;
  private prevPeak = 0;
  private readonly onFlash: () => void;
  private readonly onMetrics?: (metrics: FlashMetrics) => void;
  private thresholdMultiplier: number;
  private readonly cooldownMs: number;

  constructor(options: FlashDetectorOptions) {
    this.onFlash = options.onFlash;
    this.onMetrics = options.onMetrics;
    this.thresholdMultiplier = options.thresholdMultiplier ?? 1.45;
    this.cooldownMs = options.cooldownMs ?? 1000;
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

  setThreshold(multiplier: number): void {
    this.thresholdMultiplier = multiplier;
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
    this.resetCalibration();
    this.loop();
  }

  rearm(): void {
    this.armed = true;
    this.spikeCount = 0;
    this.spikeWindowStart = 0;
    this.resetCalibration();
  }

  async stop(): Promise<void> {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private resetCalibration(): void {
    this.baseline = 0;
    this.calibrating = true;
    this.calibrationFrames = 0;
    this.prevPeak = 0;
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
    const { average, peak, brightRatio } = measureFrame(data, width, height);
    const luminance = average;

    if (this.calibrating) {
      this.calibrationFrames++;
      if (this.baseline === 0) {
        this.baseline = luminance;
      } else {
        this.baseline = this.baseline * 0.85 + luminance * 0.15;
      }
      if (this.calibrationFrames >= 20) {
        this.calibrating = false;
      }
      this.emitMetrics(luminance, peak);
      return;
    }

    if (this.baseline > 0 && luminance < this.baseline * 1.12) {
      this.baseline = this.baseline * 0.97 + luminance * 0.03;
    }

    const peakRatio = peak / Math.max(this.baseline, 1);
    const avgRatio = luminance / Math.max(this.baseline, 1);
    const peakDelta = peak - this.prevPeak;
    this.prevPeak = peak * 0.3 + this.prevPeak * 0.7;

    const ratio = Math.max(peakRatio, avgRatio);
    const isSpike =
      this.armed &&
      (peakRatio >= this.thresholdMultiplier ||
        (peakRatio >= this.thresholdMultiplier * 0.85 && brightRatio >= 0.008) ||
        (peakDelta >= 35 && peakRatio >= 1.25));

    if (isSpike) {
      const now = Date.now();
      if (this.spikeWindowStart === 0 || now - this.spikeWindowStart > 2500) {
        this.spikeWindowStart = now;
        this.spikeCount = 0;
      }
      this.spikeCount++;

      if (this.spikeCount >= 2 && now - this.lastFlashAt > this.cooldownMs) {
        this.lastFlashAt = now;
        this.armed = false;
        this.spikeCount = 0;
        this.spikeWindowStart = 0;
        this.onFlash();
        setTimeout(() => this.resetCalibration(), 300);
      }
    }

    this.emitMetrics(luminance, peak);
  }

  private emitMetrics(luminance: number, peak: number): void {
    if (!this.onMetrics) {
      return;
    }
    this.onMetrics({
      luminance,
      peak,
      baseline: this.baseline,
      ratio: peak / Math.max(this.baseline, 1),
      armed: this.armed,
      spikes: this.spikeCount,
    });
  }
}

function measureFrame(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { average: number; peak: number; brightRatio: number } {
  let sum = 0;
  let count = 0;
  let peak = 0;
  let brightCount = 0;
  const brightThreshold = 200;

  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += lum;
      count++;
      if (lum > peak) {
        peak = lum;
      }
      if (lum >= brightThreshold) {
        brightCount++;
      }
    }
  }

  return {
    average: count ? sum / count : 0,
    peak,
    brightRatio: count ? brightCount / count : 0,
  };
}
