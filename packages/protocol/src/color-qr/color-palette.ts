import { ColorConverter } from "./color-converter";

export interface PaletteColor {
  index: number;
  hex: string;
  rgb: [number, number, number];
  lab: [number, number, number];
}

export class ColorPalette {
  static readonly colors: readonly PaletteColor[] = [
    { index: 0, hex: "#000000", rgb: [0, 0, 0], lab: ColorConverter.rgbToLab(0, 0, 0) },
    { index: 1, hex: "#E60026", rgb: [230, 0, 38], lab: ColorConverter.rgbToLab(230, 0, 38) },
    { index: 2, hex: "#0057E7", rgb: [0, 87, 231], lab: ColorConverter.rgbToLab(0, 87, 231) },
    { index: 3, hex: "#00A651", rgb: [0, 166, 81], lab: ColorConverter.rgbToLab(0, 166, 81) },
    { index: 4, hex: "#FFD100", rgb: [255, 209, 0], lab: ColorConverter.rgbToLab(255, 209, 0) },
    { index: 5, hex: "#C400C4", rgb: [196, 0, 196], lab: ColorConverter.rgbToLab(196, 0, 196) },
    { index: 6, hex: "#00B5E2", rgb: [0, 181, 226], lab: ColorConverter.rgbToLab(0, 181, 226) },
    { index: 7, hex: "#F0F0F0", rgb: [240, 240, 240], lab: ColorConverter.rgbToLab(240, 240, 240) },
  ];

  static readonly size = 8;
  static readonly bitsPerSymbol = 3;
  static readonly blackIndex = 0;
  static readonly whiteIndex = 7;

  static byIndex(index: number): PaletteColor {
    return ColorPalette.colors[index & 7] ?? ColorPalette.colors[0];
  }

  static classify(r: number, g: number, b: number): { index: number; confidence: number } {
    const lab = ColorConverter.rgbToLab(r, g, b);
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    let secondDist = Number.POSITIVE_INFINITY;
    for (const color of ColorPalette.colors) {
      const dl = lab[0] - color.lab[0];
      const da = lab[1] - color.lab[1];
      const db = lab[2] - color.lab[2];
      const dist = dl * dl + da * da + db * db;
      if (dist < bestDist) {
        secondDist = bestDist;
        bestDist = dist;
        best = color.index;
      } else if (dist < secondDist) {
        secondDist = dist;
      }
    }
    const margin = secondDist - bestDist;
    const confidence = Math.min(1, margin / Math.max(bestDist, 1));
    return { index: best, confidence };
  }
}
