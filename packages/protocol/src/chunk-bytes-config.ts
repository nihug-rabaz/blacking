import { DEFAULT_CHUNK_BYTES } from "./types";

export class ChunkBytesConfig {
  static readonly min = 32;
  static readonly max = 800;
  static readonly defaultValue = DEFAULT_CHUNK_BYTES;

  static clamp(value: number): number {
    if (!Number.isFinite(value)) {
      return ChunkBytesConfig.defaultValue;
    }
    return Math.max(ChunkBytesConfig.min, Math.min(ChunkBytesConfig.max, Math.round(value)));
  }

  static errorCorrectionLevel(chunkBytes: number): "L" | "M" {
    return ChunkBytesConfig.clamp(chunkBytes) <= 120 ? "L" : "M";
  }

  static hint(chunkBytes: number): string {
    const bytes = ChunkBytesConfig.clamp(chunkBytes);
    if (bytes <= 90) {
      return "מעט מידע בכל QR — הכי קל למצלמה";
    }
    if (bytes <= 220) {
      return "איזון בין מספר QR לקלות סריקה";
    }
    return "הרבה מידע בכל QR — פחות QR codes";
  }
}
