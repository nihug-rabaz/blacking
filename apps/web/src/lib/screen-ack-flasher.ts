import { AckBlinkPattern } from "@/lib/ack-blink-pattern";

export class ScreenAckFlasher {
  private overlay: HTMLDivElement | null = null;
  private pattern = AckBlinkPattern.standard;

  async blinkAck(pattern = this.pattern): Promise<void> {
    const overlay = this.ensureOverlay();
    for (const step of pattern.screenSteps) {
      overlay.style.opacity = String(step.opacity);
      overlay.style.backgroundColor = "#ffffff";
      await sleep(step.durationMs);
    }
    overlay.style.opacity = "0";
  }

  private ensureOverlay(): HTMLDivElement {
    if (this.overlay) {
      return this.overlay;
    }
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;inset:0;z-index:99999;opacity:0;pointer-events:none;background:#fff;transition:opacity 80ms";
    document.body.appendChild(el);
    this.overlay = el;
    return el;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
