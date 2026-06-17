import { AckAudioSignal } from "@blacking/protocol";

export class ToneAckPlayer {
  private context: AudioContext | null = null;

  async play(): Promise<void> {
    const ctx = await this.ensureContext();
    for (let index = 0; index < AckAudioSignal.tonesHz.length; index++) {
      if (index > 0) {
        await sleep(AckAudioSignal.toneGapMs);
      }
      await this.playTone(ctx, AckAudioSignal.tonesHz[index], AckAudioSignal.toneDurationMs);
    }
  }

  async stop(): Promise<void> {
    if (!this.context) {
      return;
    }
    await this.context.close();
    this.context = null;
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.context || this.context.state === "closed") {
      this.context = new AudioContext();
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    return this.context;
  }

  private playTone(ctx: AudioContext, frequencyHz: number, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequencyHz;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      const startAt = ctx.currentTime;
      const endAt = startAt + durationMs / 1000;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.4, startAt + 0.01);
      gain.gain.setValueAtTime(0.4, endAt - 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.start(startAt);
      oscillator.stop(endAt);
      oscillator.onended = () => resolve();
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
