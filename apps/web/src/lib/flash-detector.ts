export type FlashDetectorOptions = {
  onFlash: () => void;
  thresholdMultiplier?: number;
  cooldownMs?: number;
};

export class FlashDetector {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stream: MediaStream | null = null;
  private rafId = 0;
  private running = false;
  private baseline = 0;
  private samples: number[] = [];
  private lastFlashAt = 0;
  private armed = true;
  private readonly onFlash: () => void;
  private readonly thresholdMultiplier: number;
  private readonly cooldownMs: number;

  constructor(options: FlashDetectorOptions) {
    this.onFlash = options.onFlash;
    this.thresholdMultiplier = options.thresholdMultiplier ?? 2.2;
    this.cooldownMs = options.cooldownMs ?? 1800;
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

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.baseline = 0;
    this.samples = [];
    this.loop();
  }

  rearm(): void {
    this.armed = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
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
    const luminance = averageLuminance(data, width, height);

    this.samples.push(luminance);
    if (this.samples.length > 30) {
      this.samples.shift();
    }

    if (this.baseline === 0 && this.samples.length >= 15) {
      this.baseline = median(this.samples) || luminance;
    }

    if (this.baseline > 0 && this.armed) {
      const ratio = luminance / this.baseline;
      const now = Date.now();
      if (ratio >= this.thresholdMultiplier && now - this.lastFlashAt > this.cooldownMs) {
        this.lastFlashAt = now;
        this.armed = false;
        this.onFlash();
        setTimeout(() => {
          this.baseline = median(this.samples) || this.baseline;
        }, 400);
      }
    }

    if (this.baseline > 0) {
      const alpha = 0.08;
      this.baseline = this.baseline * (1 - alpha) + luminance * alpha;
    }
  }
}

function averageLuminance(data: Uint8ClampedArray, width: number, height: number): number {
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const boxW = Math.floor(width * 0.5);
  const boxH = Math.floor(height * 0.5);
  const x0 = Math.max(0, cx - boxW / 2);
  const y0 = Math.max(0, cy - boxH / 2);
  const x1 = Math.min(width, x0 + boxW);
  const y1 = Math.min(height, y0 + boxH);

  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4;
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      count++;
    }
  }
  return count ? sum / count : 0;
}

function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
