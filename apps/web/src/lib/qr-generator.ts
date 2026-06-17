import QRCode from "qrcode";
import { ChunkBytesConfig, DEFAULT_CHUNK_BYTES } from "@blacking/protocol";
import { generateColorQrDataUrl } from "./color-qr/color-qr-renderer";
import type { QrVisualMode } from "./qr-mode";

export const QR_RENDER_SIZE = 1024;
export const QR_DISPLAY_SIZE = 800;

export async function generateQrDataUrl(
  payload: string,
  chunkBytes: number = DEFAULT_CHUNK_BYTES,
  mode: QrVisualMode = "standard",
): Promise<string> {
  if (mode === "color") {
    return generateColorQrDataUrl(payload);
  }
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: ChunkBytesConfig.errorCorrectionLevel(chunkBytes),
    margin: 1,
    width: QR_RENDER_SIZE,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
