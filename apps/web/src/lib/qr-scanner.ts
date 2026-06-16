import { BrowserQRCodeReader } from "@zxing/browser";

export type ScanCallback = (text: string) => void;

export class QrScanner {
  private reader = new BrowserQRCodeReader();
  private stream: MediaStream | null = null;
  private active = false;
  private stopControls: (() => void) | null = null;

  async start(videoElement: HTMLVideoElement, onScan: ScanCallback): Promise<void> {
    if (this.active) {
      return;
    }
    this.active = true;
    const devices = await BrowserQRCodeReader.listVideoInputDevices();
    const backCamera = devices.find((device) => /back|rear|environment/i.test(device.label));
    const deviceId = backCamera?.deviceId ?? devices[0]?.deviceId;

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    videoElement.srcObject = this.stream;
    await videoElement.play();

    const controls = await this.reader.decodeFromVideoElement(videoElement, (result) => {
      if (!this.active) {
        return;
      }
      if (result) {
        onScan(result.getText());
      }
    });
    this.stopControls = () => controls.stop();
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  stop(): void {
    this.active = false;
    this.stopControls?.();
    this.stopControls = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
