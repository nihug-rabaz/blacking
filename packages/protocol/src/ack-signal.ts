export type AckChannel = "optical" | "audio";

export class AckAudioSignal {
  static readonly tonesHz: readonly [number, number] = [1568.7, 2353.05];
  static readonly toneDurationMs = 95;
  static readonly toneGapMs = 65;
  static readonly requiredDetections = 2;
  static readonly snrMinRatio = 11;
  static readonly absoluteMinPower = 0.0008;

  static get totalDurationMs(): number {
    return (
      AckAudioSignal.toneDurationMs * AckAudioSignal.tonesHz.length +
      AckAudioSignal.toneGapMs * (AckAudioSignal.tonesHz.length - 1)
    );
  }
}
