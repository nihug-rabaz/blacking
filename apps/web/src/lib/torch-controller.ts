type TorchCapableTrack = MediaStreamTrack & {
  applyConstraints: (constraints: MediaTrackConstraints) => Promise<void>;
};

export class TorchController {
  private track: TorchCapableTrack | null = null;

  bind(stream: MediaStream): void {
    this.track = stream.getVideoTracks()[0] as TorchCapableTrack;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (!this.track) {
      return;
    }
    try {
      await this.track.applyConstraints({
        advanced: [{ torch: enabled } as MediaTrackConstraintSet],
      });
    } catch {
      try {
        await this.track.applyConstraints({ torch: enabled } as MediaTrackConstraints);
      } catch {
        /* torch unsupported */
      }
    }
  }

  async blinkAck(): Promise<void> {
    const pattern = [true, false, true, false, true, false] as const;
    for (const state of pattern) {
      await this.setEnabled(state);
      await sleep(state ? 120 : 100);
    }
  }

  async off(): Promise<void> {
    await this.setEnabled(false);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
