import { Crc32 } from "./crc32";
import { ColorGridLayout } from "./color-grid-layout";
import { COLOR_QR_MAGIC, COLOR_QR_RS_PARITY, ColorQrConfig } from "./color-qr-config";
import { ReedSolomonCodec } from "./reed-solomon";
import { SymbolCodec } from "./symbol-codec";

export class ColorQrEncoder {
  private readonly rs = new ReedSolomonCodec(COLOR_QR_RS_PARITY);

  encodePayload(text: string): number[][] {
    const payload = new TextEncoder().encode(text);
    if (payload.length > ColorQrConfig.maxPayloadBytes) {
      throw new Error(`payload exceeds color QR capacity (${ColorQrConfig.maxPayloadBytes} bytes)`);
    }
    const frame = new Uint8Array(COLOR_QR_MAGIC.length + 2 + payload.length + 4);
    frame.set(COLOR_QR_MAGIC, 0);
    frame[4] = (payload.length >> 8) & 0xff;
    frame[5] = payload.length & 0xff;
    frame.set(payload, 6);
    const crc = Crc32.compute(payload);
    frame[6 + payload.length] = (crc >>> 24) & 0xff;
    frame[7 + payload.length] = (crc >>> 16) & 0xff;
    frame[8 + payload.length] = (crc >>> 8) & 0xff;
    frame[9 + payload.length] = crc & 0xff;
    const codeword = this.rs.encode(frame);
    const symbols = SymbolCodec.bytesToSymbols(codeword);
    return this.placeSymbols(symbols);
  }

  private placeSymbols(symbols: number[]): number[][] {
    const grid = ColorGridLayout.buildFunctionGrid();
    const capacity = ColorGridLayout.dataCapacity();
    const padded = symbols.slice(0, capacity);
    while (padded.length < capacity) {
      padded.push(0);
    }
    let index = 0;
    for (const [x, y] of ColorGridLayout.dataCoordinates()) {
      grid[y][x] = padded[index++];
    }
    return grid;
  }
}
