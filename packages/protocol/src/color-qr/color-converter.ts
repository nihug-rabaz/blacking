export class ColorConverter {
  static rgbToLab(r: number, g: number, b: number): [number, number, number] {
    let rn = r / 255;
    let gn = g / 255;
    let bn = b / 255;
    rn = rn > 0.04045 ? Math.pow((rn + 0.055) / 1.055, 2.4) : rn / 12.92;
    gn = gn > 0.04045 ? Math.pow((gn + 0.055) / 1.055, 2.4) : gn / 12.92;
    bn = bn > 0.04045 ? Math.pow((bn + 0.055) / 1.055, 2.4) : bn / 12.92;
    const x = (rn * 0.4124564 + gn * 0.3575761 + bn * 0.1804375) / 0.95047;
    const y = rn * 0.2126729 + gn * 0.7151522 + bn * 0.072175;
    const z = (rn * 0.0193339 + gn * 0.119192 + bn * 0.9503041) / 1.08883;
    const fx = x > 0.008856 ? Math.cbrt(x) : 7.787 * x + 16 / 116;
    const fy = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116;
    const fz = z > 0.008856 ? Math.cbrt(z) : 7.787 * z + 16 / 116;
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
}
