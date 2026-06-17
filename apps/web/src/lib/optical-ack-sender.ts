import { AckBlinkPattern } from "@/lib/ack-blink-pattern";
import { OpticalSyncTiming } from "@/lib/optical-sync-timing";
import { ScreenAckFlasher } from "@/lib/screen-ack-flasher";
import { TorchController } from "@/lib/torch-controller";
import type { QrScanner } from "@/lib/qr-scanner";

export class OpticalAckSender {
  private torch = new TorchController();
  private screen = new ScreenAckFlasher();
  private pattern = AckBlinkPattern.standard;
  private lastAckAt = 0;
  private torchWorks = false;
  private torchTested = false;
  private ackCount = 0;

  reset(): void {
    this.lastAckAt = 0;
    this.torchWorks = false;
    this.torchTested = false;
    this.ackCount = 0;
  }

  bindScannerStream(stream: MediaStream): void {
    this.torch.bind(stream);
  }

  isTorchSupported(): boolean {
    return this.torchWorks;
  }

  async send(scanner: QrScanner | null): Promise<void> {
    const preDelay =
      this.ackCount === 0
        ? OpticalSyncTiming.ackPreDelayFirstMs
        : OpticalSyncTiming.ackPreDelayMs;
    const cycleMs = preDelay + this.pattern.totalDurationMs + 300;
    const now = Date.now();
    if (now - this.lastAckAt < cycleMs) {
      return;
    }
    this.lastAckAt = now;
    this.ackCount++;

    if (preDelay > 0) {
      await sleep(preDelay);
    }

    for (let repeat = 0; repeat < OpticalSyncTiming.ackRepeatCount; repeat++) {
      await this.emitBlink();
    }

    if (this.torchWorks) {
      await this.torch.off();
      await scanner?.recoverAfterAck();
      const stream = scanner?.getStream();
      if (stream) {
        this.torch.bind(stream);
      }
    }
  }

  async off(): Promise<void> {
    await this.torch.off();
  }

  private async emitBlink(): Promise<void> {
    if (!this.torchTested) {
      this.torchTested = true;
      try {
        this.torchWorks = await this.torch.blinkAck(this.pattern);
      } catch {
        this.torchWorks = false;
      }
      if (!this.torchWorks) {
        await this.screen.blinkAck(this.pattern);
      }
      return;
    }

    if (this.torchWorks) {
      try {
        await this.torch.blinkAck(this.pattern);
      } catch {
        this.torchWorks = false;
        await this.screen.blinkAck(this.pattern);
      }
      return;
    }

    await this.screen.blinkAck(this.pattern);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
