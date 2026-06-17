import { QrScanner } from "./qr-scanner";
import { ColorQrScanner } from "./color-qr/color-qr-scanner";
import type { IQrScanner } from "./qr-scanner-interface";
import type { QrVisualMode } from "./qr-mode";

export type { IQrScanner } from "./qr-scanner-interface";

export function createQrScanner(mode: QrVisualMode): IQrScanner {
  if (mode === "standard") {
    return new QrScanner();
  }
  return new ColorQrScanner(mode);
}
