import { AckBlinkPattern } from "@/lib/ack-blink-pattern";

type TorchCapableTrack = MediaStreamTrack & {
  applyConstraints: (constraints: MediaTrackConstraints) => Promise<void>;
};

export class TorchController {
  private track: TorchCapableTrack | null = null;
  private supported = false;
  private pattern = AckBlinkPattern.standard;

  bind(stream: MediaStream): void {
    this.track = stream.getVideoTracks()[0] as TorchCapableTrack;
    this.supported = false;
  }

  isSupported(): boolean {
    return this.supported;
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    if (!this.track) {
      return false;
    }
    try {
      await this.track.applyConstraints({
        advanced: [{ torch: enabled } as MediaTrackConstraintSet],
      });
      if (enabled) {
        this.supported = true;
      }
      return true;
    } catch {
      try {
        await this.track.applyConstraints({ torch: enabled } as MediaTrackConstraints);
        if (enabled) {
          this.supported = true;
        }
        return true;
      } catch {
        return false;
      }
    }
  }

  async blinkAck(pattern = this.pattern): Promise<boolean> {
    let anySuccess = false;
    for (const step of pattern.torchSteps) {
      const ok = await this.setEnabled(step.enabled);
      if (ok && step.enabled) {
        anySuccess = true;
      }
      await sleep(step.durationMs);
    }
    return anySuccess;
  }

  async off(): Promise<void> {
    await this.setEnabled(false);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
