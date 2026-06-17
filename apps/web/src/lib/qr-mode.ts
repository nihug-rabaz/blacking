export type QrVisualMode = "standard" | "color" | "auto";

export const QR_MODE_STORAGE_KEY = "blacking-qr-mode";

export function getStoredQrMode(): QrVisualMode {
  if (typeof window === "undefined") {
    return "standard";
  }
  const stored = localStorage.getItem(QR_MODE_STORAGE_KEY);
  if (stored === "color" || stored === "auto") {
    return stored;
  }
  return "standard";
}

export function storeQrMode(mode: QrVisualMode): void {
  localStorage.setItem(QR_MODE_STORAGE_KEY, mode);
}

export function qrModeLabel(mode: QrVisualMode): string {
  if (mode === "color") {
    return "צבע";
  }
  if (mode === "auto") {
    return "אוטו";
  }
  return "שחור-לבן";
}
