type TorchCapableTrack = MediaStreamTrack & {
  applyConstraints: (constraints: MediaTrackConstraints) => Promise<void>;
};

export class TorchController {
  private track: TorchCapableTrack | null = null;
  private supported = false;

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

  async blinkAck(): Promise<boolean> {
    const pattern = [true, false, true, false, true, false, true, false] as const;
    let anySuccess = false;
    for (const state of pattern) {
      const ok = await this.setEnabled(state);
      if (ok && state) {
        anySuccess = true;
      }
      await sleep(state ? 280 : 180);
    }
    return anySuccess;
  }

  async testBlink(): Promise<boolean> {
    return this.blinkAck();
  }

  async off(): Promise<void> {
    await this.setEnabled(false);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
