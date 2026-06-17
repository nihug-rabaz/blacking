import { ColorPalette } from "./color-palette";

export class ColorGridLayout {
  static readonly size = 33;

  static isInFinder(x: number, y: number): boolean {
    const zones = [
      { ox: 0, oy: 0 },
      { ox: ColorGridLayout.size - 7, oy: 0 },
      { ox: 0, oy: ColorGridLayout.size - 7 },
    ];
    return zones.some(
      (zone) => x >= zone.ox && x < zone.ox + 7 && y >= zone.oy && y < zone.oy + 7,
    );
  }

  static isInSeparator(x: number, y: number): boolean {
    const zones = [
      { ox: 0, oy: 0, w: 8, h: 8 },
      { ox: ColorGridLayout.size - 8, oy: 0, w: 8, h: 8 },
      { ox: 0, oy: ColorGridLayout.size - 8, w: 8, h: 8 },
    ];
    return (
      zones.some(
        (zone) => x >= zone.ox && x < zone.ox + zone.w && y >= zone.oy && y < zone.oy + zone.h,
      ) && !ColorGridLayout.isInFinder(x, y)
    );
  }

  static isTiming(x: number, y: number): boolean {
    if (ColorGridLayout.isInFinder(x, y) || ColorGridLayout.isInSeparator(x, y)) {
      return false;
    }
    if (x === 6 && y >= 8 && y <= 24) {
      return true;
    }
    if (y === 6 && x >= 8 && x <= 24) {
      return true;
    }
    return false;
  }

  static isAlignment(x: number, y: number): boolean {
    if (ColorGridLayout.isInFinder(x, y) || ColorGridLayout.isInSeparator(x, y)) {
      return false;
    }
    const cx = 16;
    const cy = 16;
    return Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2;
  }

  static isFunction(x: number, y: number): boolean {
    return (
      ColorGridLayout.isInFinder(x, y) ||
      ColorGridLayout.isInSeparator(x, y) ||
      ColorGridLayout.isTiming(x, y) ||
      ColorGridLayout.isAlignment(x, y)
    );
  }

  static finderSymbol(x: number, y: number, originX: number, originY: number): number {
    const lx = x - originX;
    const ly = y - originY;
    const outer = lx === 0 || ly === 0 || lx === 6 || ly === 6;
    const inner = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
    return outer || inner ? ColorPalette.blackIndex : ColorPalette.whiteIndex;
  }

  static timingSymbol(x: number, y: number): number {
    return (x + y) % 2 === 0 ? ColorPalette.blackIndex : ColorPalette.whiteIndex;
  }

  static alignmentSymbol(x: number, y: number): number {
    const cx = 16;
    const cy = 16;
    const outer = Math.abs(x - cx) === 2 || Math.abs(y - cy) === 2;
    const center = x === cx && y === cy;
    return outer || center ? ColorPalette.blackIndex : ColorPalette.whiteIndex;
  }

  static functionSymbol(x: number, y: number): number {
    if (ColorGridLayout.isInFinder(x, y)) {
      if (x < 7 && y < 7) {
        return ColorGridLayout.finderSymbol(x, y, 0, 0);
      }
      if (x >= ColorGridLayout.size - 7 && y < 7) {
        return ColorGridLayout.finderSymbol(x, y, ColorGridLayout.size - 7, 0);
      }
      return ColorGridLayout.finderSymbol(x, y, 0, ColorGridLayout.size - 7);
    }
    if (ColorGridLayout.isInSeparator(x, y)) {
      return ColorPalette.whiteIndex;
    }
    if (ColorGridLayout.isTiming(x, y)) {
      return ColorGridLayout.timingSymbol(x, y);
    }
    if (ColorGridLayout.isAlignment(x, y)) {
      return ColorGridLayout.alignmentSymbol(x, y);
    }
    return ColorPalette.whiteIndex;
  }

  static *dataCoordinates(): Generator<[number, number]> {
    for (let y = 0; y < ColorGridLayout.size; y++) {
      const right = y % 2 === 0;
      if (right) {
        for (let x = ColorGridLayout.size - 1; x >= 0; x--) {
          if (!ColorGridLayout.isFunction(x, y)) {
            yield [x, y];
          }
        }
      } else {
        for (let x = 0; x < ColorGridLayout.size; x++) {
          if (!ColorGridLayout.isFunction(x, y)) {
            yield [x, y];
          }
        }
      }
    }
  }

  static dataCapacity(): number {
    let count = 0;
    for (const _ of ColorGridLayout.dataCoordinates()) {
      count++;
    }
    return count;
  }

  static buildFunctionGrid(): number[][] {
    const grid: number[][] = [];
    for (let y = 0; y < ColorGridLayout.size; y++) {
      const row: number[] = [];
      for (let x = 0; x < ColorGridLayout.size; x++) {
        row.push(
          ColorGridLayout.isFunction(x, y) ? ColorGridLayout.functionSymbol(x, y) : -1,
        );
      }
      grid.push(row);
    }
    return grid;
  }
}
