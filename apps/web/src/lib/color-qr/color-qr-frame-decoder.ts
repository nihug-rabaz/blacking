import {
  ColorGridLayout,
  ColorPalette,
  ColorQrDecoder,
  ColorQrConfig,
  type ColorClassification,
} from "@blacking/protocol";
import { ColorQrFinder, type Point } from "./color-qr-finder";

export class ColorQrFrameDecoder {
  private readonly decoder = new ColorQrDecoder();

  decodeFrame(imageData: ImageData): string | null {
    const finders = ColorQrFinder.detect(imageData);
    const grid =
      finders.length >= 3
        ? this.sampleWithFinders(imageData, finders.slice(0, 3))
        : this.sampleCenterSquare(imageData);
    if (!grid) {
      return null;
    }
    const { symbols, classifications } = this.classifyGrid(imageData, grid);
    const symbolGrid = this.applySymbols(grid, symbols);
    const result = this.decoder.decodeWithConfidence(symbolGrid, classifications);
    if (!result || result.averageConfidence < 0.05) {
      return null;
    }
    return result.text;
  }

  private sampleWithFinders(
    imageData: ImageData,
    finders: { center: Point }[],
  ): { x: number; y: number }[][] | null {
    const sorted = this.sortFinders(finders);
    const src = sorted.map((item) => item.center);
    const dst = [
      { x: 3.5, y: 3.5 },
      { x: ColorQrConfig.gridSize - 3.5, y: 3.5 },
      { x: 3.5, y: ColorQrConfig.gridSize - 3.5 },
    ];
    const matrix = this.affineFromPoints(src, dst);
    if (!matrix) {
      return null;
    }
    return this.buildSampleGrid(matrix);
  }

  private sampleCenterSquare(imageData: ImageData): { x: number; y: number }[][] | null {
    const side = Math.min(imageData.width, imageData.height) * 0.72;
    const left = (imageData.width - side) / 2;
    const top = (imageData.height - side) / 2;
    const grid: { x: number; y: number }[][] = [];
    for (let y = 0; y < ColorQrConfig.gridSize; y++) {
      const row: { x: number; y: number }[] = [];
      for (let x = 0; x < ColorQrConfig.gridSize; x++) {
        row.push({
          x: left + ((x + 0.5) / ColorQrConfig.gridSize) * side,
          y: top + ((y + 0.5) / ColorQrConfig.gridSize) * side,
        });
      }
      grid.push(row);
    }
    return grid;
  }

  private buildSampleGrid(matrix: AffineMatrix): { x: number; y: number }[][] {
    const grid: { x: number; y: number }[][] = [];
    for (let y = 0; y < ColorQrConfig.gridSize; y++) {
      const row: { x: number; y: number }[] = [];
      for (let x = 0; x < ColorQrConfig.gridSize; x++) {
        row.push(this.transformPoint(matrix, x + 0.5, y + 0.5));
      }
      grid.push(row);
    }
    return grid;
  }

  private classifyGrid(
    imageData: ImageData,
    sampleGrid: { x: number; y: number }[][],
  ): { symbols: number[][]; classifications: ColorClassification[] } {
    const symbols: number[][] = [];
    const classifications: ColorClassification[] = [];
    const { data, width } = imageData;
    for (let y = 0; y < ColorQrConfig.gridSize; y++) {
      const row: number[] = [];
      for (let x = 0; x < ColorQrConfig.gridSize; x++) {
        const point = sampleGrid[y][x];
        const px = Math.max(0, Math.min(width - 1, Math.round(point.x)));
        const py = Math.max(0, Math.min(imageData.height - 1, Math.round(point.y)));
        const offset = (py * width + px) * 4;
        const classified = ColorPalette.classify(data[offset], data[offset + 1], data[offset + 2]);
        row.push(classified.index);
        if (!ColorGridLayout.isFunction(x, y)) {
          classifications.push(classified);
        }
      }
      symbols.push(row);
    }
    return { symbols, classifications };
  }

  private applySymbols(grid: { x: number; y: number }[][], symbols: number[][]): number[][] {
    return symbols;
  }

  private sortFinders(finders: { center: Point }[]): { center: Point }[] {
    const sorted = [...finders].sort((a, b) => a.center.y - b.center.y);
    const top = sorted.slice(0, 2).sort((a, b) => a.center.x - b.center.x);
    const bottom = sorted
      .filter((item) => item.center.y > top[0].center.y)
      .sort((a, b) => a.center.x - b.center.x)[0];
    return [top[0], top[1], bottom ?? sorted[2]];
  }

  private affineFromPoints(src: Point[], dst: Point[]): AffineMatrix | null {
    const [s0, s1, s2] = src;
    const [d0, d1, d2] = dst;
    const matrix = solveAffine(
      [s0.x, s0.y, 1, 0, 0, 0],
      [0, 0, 0, s0.x, s0.y, 1],
      [s1.x, s1.y, 1, 0, 0, 0],
      [0, 0, 0, s1.x, s1.y, 1],
      [s2.x, s2.y, 1, 0, 0, 0],
      [0, 0, 0, s2.x, s2.y, 1],
      [d0.x, d1.x, d2.x, d0.y, d1.y, d2.y],
    );
    return matrix;
  }

  private transformPoint(matrix: AffineMatrix, x: number, y: number): Point {
    return {
      x: matrix.a * x + matrix.b * y + matrix.c,
      y: matrix.d * x + matrix.e * y + matrix.f,
    };
  }
}

interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

function solveAffine(
  r1: number[],
  r2: number[],
  r3: number[],
  r4: number[],
  r5: number[],
  r6: number[],
  b: number[],
): AffineMatrix | null {
  const rows = [r1, r2, r3, r4, r5, r6];
  const n = 6;
  const aug = rows.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(aug[pivot][col]) < 1e-8) {
      return null;
    }
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const div = aug[col][col];
    for (let j = col; j <= n; j++) {
      aug[col][j] /= div;
    }
    for (let row = 0; row < n; row++) {
      if (row === col) {
        continue;
      }
      const factor = aug[row][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }
  const x = aug.map((row) => row[n]);
  return { a: x[0], b: x[1], c: x[2], d: x[3], e: x[4], f: x[5] };
}
