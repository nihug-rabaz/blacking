import { BrowserQRCodeReader } from "@zxing/browser";

export type ScanCallback = (text: string) => void;

export class QrScanner {
  private reader = new BrowserQRCodeReader();
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private onScan: ScanCallback | null = null;
  private active = false;
  private decoding = false;
  private stopControls: (() => void) | null = null;
  private lastText = "";
  private lastTextAt = 0;
  private lastAcceptedIndex = -1;
  private cachedDeviceId: string | undefined;

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

  notifyAccepted(index: number): void {
    this.lastAcceptedIndex = index;
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
    const controls = await this.reader.decodeFromVideoElement(
      this.videoElement,
      (result, _error, decodeControls) => {
        if (!this.active) {
          decodeControls.stop();
          return;
        }
        if (!result) {
          return;
        }

        const text = result.getText();
        const now = Date.now();
        if (text === this.lastText && now - this.lastTextAt < 300) {
          return;
        }

        this.lastText = text;
        this.lastTextAt = now;
        this.onScan?.(text);
      },
    );
    this.stopControls = () => {
      controls.stop();
      this.decoding = false;
    };
  }

  private stopDecoding(): void {
    this.stopControls?.();
    this.stopControls = null;
    this.decoding = false;
  }
}
