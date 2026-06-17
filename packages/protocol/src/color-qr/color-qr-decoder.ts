import { Crc32 } from "./crc32";
import { ColorGridLayout } from "./color-grid-layout";
import { COLOR_QR_MAGIC, COLOR_QR_RS_PARITY, ColorQrConfig } from "./color-qr-config";
import { ReedSolomonCodec } from "./reed-solomon";
import { SymbolCodec } from "./symbol-codec";

export interface ColorClassification {
  index: number;
  confidence: number;
}

export interface ColorQrDecodeResult {
  text: string;
  averageConfidence: number;
  corrected: boolean;
}

export class ColorQrDecoder {
  private readonly rs = new ReedSolomonCodec(COLOR_QR_RS_PARITY);

  decodeGrid(grid: number[][]): ColorQrDecodeResult | null {
    const symbols = this.extractSymbols(grid);
    return this.decodeSymbols(symbols);
  }

  decodeSymbols(symbols: number[]): ColorQrDecodeResult | null {
    const bytes = SymbolCodec.symbolsToBytes(symbols);
    const corrected = this.rs.decode(bytes);
    if (!corrected) {
      return null;
    }
    if (corrected.length < 10) {
      return null;
    }
    for (let i = 0; i < COLOR_QR_MAGIC.length; i++) {
      if (corrected[i] !== COLOR_QR_MAGIC[i]) {
        return null;
      }
    }
    const length = (corrected[4] << 8) | corrected[5];
    if (length < 0 || 6 + length + 4 > corrected.length) {
      return null;
    }
    const payload = corrected.slice(6, 6 + length);
    const crc =
      ((corrected[6 + length] << 24) |
        (corrected[7 + length] << 16) |
        (corrected[8 + length] << 8) |
        corrected[9 + length]) >>>
      0;
    if (Crc32.compute(payload) !== crc) {
      return null;
    }
    return {
      text: new TextDecoder().decode(payload),
      averageConfidence: 1,
      corrected: bytes.some((b, i) => b !== corrected[i]),
    };
  }

  decodeWithConfidence(
    grid: number[][],
    classifications: ColorClassification[],
  ): ColorQrDecodeResult | null {
    const direct = this.decodeGrid(grid);
    if (direct) {
      const avg =
        classifications.reduce((sum, item) => sum + item.confidence, 0) /
        Math.max(classifications.length, 1);
      return { ...direct, averageConfidence: avg };
    }
    if (classifications.some((item) => item.confidence < 0.15)) {
      const repaired = this.repairLowConfidence(grid, classifications);
      const fallback = this.decodeGrid(repaired);
      if (fallback) {
        const avg =
          classifications.reduce((sum, item) => sum + item.confidence, 0) /
          Math.max(classifications.length, 1);
        return { ...fallback, averageConfidence: avg, corrected: true };
      }
    }
    return null;
  }

  private extractSymbols(grid: number[][]): number[] {
    const symbols: number[] = [];
    for (const [x, y] of ColorGridLayout.dataCoordinates()) {
      symbols.push(grid[y]?.[x] ?? 0);
    }
    return symbols;
  }

  private repairLowConfidence(
    grid: number[][],
    classifications: ColorClassification[],
  ): number[][] {
    const repaired = grid.map((row) => [...row]);
    let dataIndex = 0;
    for (const [x, y] of ColorGridLayout.dataCoordinates()) {
      const info = classifications[dataIndex++];
      if (info && info.confidence < 0.15) {
        repaired[y][x] = info.index;
      }
    }
    return repaired;
  }

  static isColorQrCandidate(grid: number[][]): boolean {
    if (grid.length !== ColorQrConfig.gridSize) {
      return false;
    }
    const topLeft = grid[0]?.[0];
    const topRight = grid[0]?.[ColorQrConfig.gridSize - 1];
    const bottomLeft = grid[ColorQrConfig.gridSize - 1]?.[0];
    return topLeft === 0 && topRight === 0 && bottomLeft === 0;
  }
}
