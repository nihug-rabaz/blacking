import {
  ColorPalette,
  ColorQrEncoder,
  ColorQrConfig,
  ColorGridLayout,
} from "@blacking/protocol";

export const COLOR_QR_RENDER_SIZE = 1024;
export const COLOR_QR_DISPLAY_SIZE = 800;

export class ColorQrRenderer {
  private readonly encoder = new ColorQrEncoder();

  renderDataUrl(payload: string): string {
    const grid = this.encoder.encodePayload(payload);
    const canvas = document.createElement("canvas");
    const size = COLOR_QR_RENDER_SIZE;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("canvas unavailable");
    }
    const moduleSize = size / ColorQrConfig.gridSize;
    const quiet = moduleSize;
    canvas.width = size + quiet * 2;
    canvas.height = size + quiet * 2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < ColorGridLayout.size; y++) {
      for (let x = 0; x < ColorGridLayout.size; x++) {
        const symbol = grid[y][x];
        if (symbol < 0) {
          continue;
        }
        ctx.fillStyle = ColorPalette.byIndex(symbol).hex;
        ctx.fillRect(
          quiet + x * moduleSize,
          quiet + y * moduleSize,
          moduleSize + 0.5,
          moduleSize + 0.5,
        );
      }
    }
    return canvas.toDataURL("image/png");
  }
}

export function generateColorQrDataUrl(payload: string): string {
  return new ColorQrRenderer().renderDataUrl(payload);
}
