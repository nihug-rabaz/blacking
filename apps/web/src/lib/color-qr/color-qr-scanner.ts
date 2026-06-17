import { BrowserQRCodeReader } from "@zxing/browser";
import { ColorQrFrameDecoder } from "./color-qr-frame-decoder";
import type { QrVisualMode } from "../qr-mode";

import type { ScanCallback } from "../qr-scanner-interface";

export type { ScanCallback };

export class ColorQrScanner {
  private reader = new BrowserQRCodeReader();
  private frameDecoder = new ColorQrFrameDecoder();
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private onScan: ScanCallback | null = null;
  private active = false;
  private decoding = false;
  private stopControls: (() => void) | null = null;
  private rafId = 0;
  private canvas: HTMLCanvasElement | null = null;
  private lastText = "";
  private lastTextAt = 0;
  private cachedDeviceId: string | undefined;
  private mode: QrVisualMode;

  constructor(mode: QrVisualMode = "color") {
    this.mode = mode;
  }

  async start(videoElement: HTMLVideoElement, onScan: ScanCallback): Promise<void> {
    if (this.active) {
      return;
    }
    this.active = true;
    this.videoElement = videoElement;
    this.onScan = onScan;
    await this.openCamera(videoElement);
    await this.startDecoding();
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  notifyAccepted(_index: number): void {
    this.lastText = "";
    this.lastTextAt = 0;
  }

  isHealthy(): boolean {
    if (!this.active || !this.videoElement) {
      return false;
    }
    const track = this.stream?.getVideoTracks()[0];
    return (
      this.decoding &&
      !!track &&
      track.readyState === "live" &&
      !track.muted &&
      this.videoElement.readyState >= 2 &&
      !this.videoElement.paused
    );
  }

  async recoverAfterAck(): Promise<void> {
    if (!this.active || !this.videoElement) {
      return;
    }
    if (await this.resumeDecoding()) {
      return;
    }
    await this.reopenCameraSmooth();
  }

  stop(): void {
    this.active = false;
    this.stopDecoding();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.videoElement = null;
    this.onScan = null;
    this.cachedDeviceId = undefined;
    this.canvas = null;
  }

  private async resumeDecoding(): Promise<boolean> {
    if (!this.stream || !this.videoElement) {
      return false;
    }
    const track = this.stream.getVideoTracks()[0];
    if (!track || track.readyState !== "live" || track.muted) {
      return false;
    }
    this.stopDecoding();
    try {
      await this.startDecoding();
      return this.decoding;
    } catch {
      return false;
    }
  }

  private async reopenCameraSmooth(): Promise<void> {
    const videoElement = this.videoElement;
    if (!this.active || !videoElement) {
      return;
    }
    const newStream = await this.requestStream();
    this.stopDecoding();
    const oldStream = this.stream;
    this.stream = newStream;
    videoElement.srcObject = newStream;
    await videoElement.play();
    oldStream?.getTracks().forEach((track) => track.stop());
    this.reader = new BrowserQRCodeReader();
    this.frameDecoder = new ColorQrFrameDecoder();
    await this.startDecoding();
  }

  private async openCamera(videoElement: HTMLVideoElement): Promise<void> {
    this.stream = await this.requestStream();
    videoElement.srcObject = this.stream;
    await videoElement.play();
  }

  private async requestStream(): Promise<MediaStream> {
    const devices = await BrowserQRCodeReader.listVideoInputDevices();
    const backCamera = devices.find((device) => /back|rear|environment/i.test(device.label));
    const deviceId = this.cachedDeviceId ?? backCamera?.deviceId ?? devices[0]?.deviceId;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    this.cachedDeviceId = track?.getSettings().deviceId ?? deviceId;
    return stream;
  }

  private async startDecoding(): Promise<void> {
    if (!this.videoElement || !this.onScan || this.decoding) {
      return;
    }
    this.decoding = true;
    if (this.mode === "standard") {
      await this.startZxing();
      return;
    }
    if (this.mode === "auto") {
      await this.startHybrid();
      return;
    }
    this.startColorLoop();
  }

  private async startZxing(): Promise<void> {
    if (!this.videoElement || !this.onScan) {
      return;
    }
    const controls = await this.reader.decodeFromVideoElement(this.videoElement, (result) => {
      if (!this.active || !result) {
        return;
      }
      this.emitScan(result.getText());
    });
    this.stopControls = () => {
      controls.stop();
      this.decoding = false;
    };
  }

  private async startHybrid(): Promise<void> {
    if (!this.videoElement || !this.onScan) {
      return;
    }
    this.startColorLoop();
    const controls = await this.reader.decodeFromVideoElement(this.videoElement, (result) => {
      if (!this.active || !result) {
        return;
      }
      this.emitScan(result.getText());
    });
    const stopZxing = () => controls.stop();
    const previousStop = this.stopControls;
    this.stopControls = () => {
      stopZxing();
      previousStop?.();
      this.decoding = false;
    };
  }

  private startColorLoop(): void {
    if (!this.videoElement) {
      return;
    }
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
    }
    const tick = () => {
      if (!this.active || !this.videoElement || !this.onScan) {
        return;
      }
      const video = this.videoElement;
      if (video.readyState < 2) {
        this.rafId = requestAnimationFrame(tick);
        return;
      }
      const canvas = this.canvas!;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx && canvas.width > 0 && canvas.height > 0) {
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const text = this.frameDecoder.decodeFrame(imageData);
        if (text) {
          this.emitScan(text);
        }
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
    const previousStop = this.stopControls;
    this.stopControls = () => {
      cancelAnimationFrame(this.rafId);
      previousStop?.();
      this.decoding = false;
    };
  }

  private emitScan(text: string): void {
    const now = Date.now();
    if (text === this.lastText && now - this.lastTextAt < 300) {
      return;
    }
    this.lastText = text;
    this.lastTextAt = now;
    this.onScan?.(text);
  }

  private stopDecoding(): void {
    this.stopControls?.();
    this.stopControls = null;
    this.decoding = false;
  }
}
