export type TorchBlinkStep = {
  enabled: boolean;
  durationMs: number;
};

export type ScreenBlinkStep = {
  opacity: number;
  durationMs: number;
};

export class AckBlinkPattern {
  static readonly requiredSpikes = 2;
  static readonly torchPulses = 1;

  readonly onMs: number;
  readonly offMs: number;
  readonly pulseCount: number;
  readonly trailingOffMs: number;

  constructor(onMs: number, offMs: number, pulseCount: number, trailingOffMs: number) {
    this.onMs = onMs;
    this.offMs = offMs;
    this.pulseCount = pulseCount;
    this.trailingOffMs = trailingOffMs;
  }

  get torchSteps(): TorchBlinkStep[] {
    const steps: TorchBlinkStep[] = [];
    for (let pulse = 0; pulse < this.pulseCount; pulse++) {
      steps.push({ enabled: true, durationMs: this.onMs });
      const isLast = pulse === this.pulseCount - 1;
      steps.push({ enabled: false, durationMs: isLast ? this.trailingOffMs : this.offMs });
    }
    return steps;
  }

  get screenSteps(): ScreenBlinkStep[] {
    return this.torchSteps.map((step) => ({
      opacity: step.enabled ? 1 : 0,
      durationMs: step.durationMs,
    }));
  }

  get totalDurationMs(): number {
    return this.torchSteps.reduce((sum, step) => sum + step.durationMs, 0);
  }

  static readonly standard = new AckBlinkPattern(380, 320, AckBlinkPattern.torchPulses, 200);
}
