import QRCode from "qrcode";
import { ChunkBytesConfig, DEFAULT_CHUNK_BYTES } from "@blacking/protocol";

export const QR_RENDER_SIZE = 1024;
export const QR_DISPLAY_SIZE = 800;

export async function generateQrDataUrl(
  payload: string,
  chunkBytes: number = DEFAULT_CHUNK_BYTES,
): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: ChunkBytesConfig.errorCorrectionLevel(chunkBytes),
    margin: 1,
    width: QR_RENDER_SIZE,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
