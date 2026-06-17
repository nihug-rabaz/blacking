import { ColorGridLayout } from "./color-grid-layout";

export const COLOR_QR_MAGIC = new Uint8Array([0x42, 0x4c, 0x4b, 0x38]);
export const COLOR_QR_RS_PARITY = 32;
export const COLOR_QR_HEADER_BYTES = 10;

export class ColorQrConfig {
  static readonly gridSize = ColorGridLayout.size;
  static readonly dataSymbolCapacity = ColorGridLayout.dataCapacity();
  static readonly bitsPerSymbol = 3;
  static readonly maxPayloadBytes = ColorQrConfig.computeMaxPayload();

  private static computeMaxPayload(): number {
    const maxBytes = Math.floor((ColorQrConfig.dataSymbolCapacity * 3) / 8);
    const usable = maxBytes - COLOR_QR_RS_PARITY - COLOR_QR_HEADER_BYTES;
    return Math.max(32, usable);
  }
}
