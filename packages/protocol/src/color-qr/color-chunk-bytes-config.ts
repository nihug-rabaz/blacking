import { ColorQrConfig } from "./color-qr-config";

export class ColorChunkBytesConfig {
  static readonly min = 32;
  static readonly max = ColorQrConfig.maxPayloadBytes;
  static readonly defaultValue = Math.min(280, ColorQrConfig.maxPayloadBytes);

  static clamp(value: number): number {
    if (!Number.isFinite(value)) {
      return ColorChunkBytesConfig.defaultValue;
    }
    return Math.max(ColorChunkBytesConfig.min, Math.min(ColorChunkBytesConfig.max, Math.round(value)));
  }

  static hint(chunkBytes: number): string {
    const bytes = ColorChunkBytesConfig.clamp(chunkBytes);
    if (bytes <= 120) {
      return "צבע QR — מעט מידע, סריקה קלה";
    }
    if (bytes <= 220) {
      return "צבע QR — איזון קיבולת ואמינות";
    }
    return "צבע QR — קיבולת מקסימלית לגריד";
  }
}
