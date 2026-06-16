export class ScreenAckFlasher {
  private overlay: HTMLDivElement | null = null;

  async blinkAck(): Promise<void> {
    const overlay = this.ensureOverlay();
    const pattern = [1, 0, 1, 0, 1, 0, 1, 0];
    for (const opacity of pattern) {
      overlay.style.opacity = String(opacity);
      overlay.style.backgroundColor = "#ffffff";
      await sleep(opacity ? 280 : 180);
    }
    overlay.style.opacity = "0";
  }

  private ensureOverlay(): HTMLDivElement {
    if (this.overlay) {
      return this.overlay;
    }
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;inset:0;z-index:99999;opacity:0;pointer-events:none;background:#fff;transition:opacity 40ms";
    document.body.appendChild(el);
    this.overlay = el;
    return el;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
