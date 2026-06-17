import type { AckChannel } from "@blacking/protocol";
import { OpticalAckSender } from "@/lib/optical-ack-sender";
import { ToneAckPlayer } from "@/lib/tone-ack-player";
import type { QrScanner } from "@/lib/qr-scanner";
import { OpticalSyncTiming } from "@/lib/optical-sync-timing";
import { AckAudioSignal } from "@blacking/protocol";

export class ScanAckSender {
  private optical = new OpticalAckSender();
  private tone = new ToneAckPlayer();
  private mode: AckChannel = "optical";
  private lastAckAt = 0;
  private ackCount = 0;

  setMode(mode: AckChannel): void {
    this.mode = mode;
  }

  reset(): void {
    this.lastAckAt = 0;
    this.ackCount = 0;
    this.optical.reset();
  }

  bindScannerStream(stream: MediaStream): void {
    this.optical.bindScannerStream(stream);
  }

  isTorchSupported(): boolean {
    return this.optical.isTorchSupported();
  }

  async send(scanner: QrScanner | null): Promise<void> {
    if (this.mode === "audio") {
      await this.sendAudio();
      return;
    }
    await this.optical.send(scanner);
  }

  async off(): Promise<void> {
    await this.optical.off();
    await this.tone.stop();
  }

  private async sendAudio(): Promise<void> {
    const preDelay =
      this.ackCount === 0
        ? OpticalSyncTiming.ackPreDelayFirstMs
        : OpticalSyncTiming.ackPreDelayMs;
    const cycleMs = preDelay + AckAudioSignal.totalDurationMs + 200;
    const now = Date.now();
    if (now - this.lastAckAt < cycleMs) {
      return;
    }
    this.lastAckAt = now;
    this.ackCount++;
    if (preDelay > 0) {
      await sleep(preDelay);
    }
    await this.tone.play();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
