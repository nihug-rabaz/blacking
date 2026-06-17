export interface Point {
  x: number;
  y: number;
}

export interface FinderHit {
  center: Point;
  size: number;
}

export class ColorQrFinder {
  static detect(imageData: ImageData): FinderHit[] {
    const { width, height, data } = imageData;
    const gray = ColorQrFinder.toGray(data);
    const threshold = ColorQrFinder.otsuThreshold(gray);
    const hits: FinderHit[] = [];
    const step = Math.max(1, Math.floor(width / 320));
    for (let y = 0; y < height; y += step) {
      ColorQrFinder.scanLine(gray, width, height, y, threshold, hits, step);
    }
    for (let x = 0; x < width; x += step) {
      ColorQrFinder.scanColumn(gray, width, height, x, threshold, hits, step);
    }
    return ColorQrFinder.clusterHits(hits);
  }

  private static toGray(rgba: Uint8ClampedArray): Uint8Array {
    const gray = new Uint8Array(rgba.length / 4);
    for (let i = 0; i < gray.length; i++) {
      const offset = i * 4;
      gray[i] = Math.round(rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114);
    }
    return gray;
  }

  private static otsuThreshold(gray: Uint8Array): number {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < gray.length; i++) {
      hist[gray[i]]++;
    }
    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += i * hist[i];
    }
    let sumB = 0;
    let wB = 0;
    let max = 0;
    let threshold = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) {
        continue;
      }
      const wF = total - wB;
      if (!wF) {
        break;
      }
      sumB += i * hist[i];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > max) {
        max = between;
        threshold = i;
      }
    }
    return threshold;
  }

  private static scanLine(
    gray: Uint8Array,
    width: number,
    height: number,
    y: number,
    threshold: number,
    hits: FinderHit[],
    step: number,
  ): void {
    const runs: number[] = [];
    let lastBlack = gray[y * width] < threshold;
    let count = 1;
    for (let x = 1; x < width; x++) {
      const black = gray[y * width + x] < threshold;
      if (black === lastBlack) {
        count++;
      } else {
        runs.push(count);
        count = 1;
        lastBlack = black;
      }
    }
    runs.push(count);
    ColorQrFinder.matchRuns(runs, hits, y, width, height, true, step);
  }

  private static scanColumn(
    gray: Uint8Array,
    width: number,
    height: number,
    x: number,
    threshold: number,
    hits: FinderHit[],
    step: number,
  ): void {
    const runs: number[] = [];
    let lastBlack = gray[x] < threshold;
    let count = 1;
    for (let y = 1; y < height; y++) {
      const black = gray[y * width + x] < threshold;
      if (black === lastBlack) {
        count++;
      } else {
        runs.push(count);
        count = 1;
        lastBlack = black;
      }
    }
    runs.push(count);
    ColorQrFinder.matchRuns(runs, hits, x, width, height, false, step);
  }

  private static matchRuns(
    runs: number[],
    hits: FinderHit[],
    fixed: number,
    width: number,
    height: number,
    horizontal: boolean,
    step: number,
  ): void {
    for (let i = 0; i + 4 < runs.length; i++) {
      const [a, b, c, d, e] = runs.slice(i, i + 5);
      if (!ColorQrFinder.isFinderRatio(a, b, c, d, e)) {
        continue;
      }
      const module = (a + b + c + d + e) / 7;
      if (module < 3) {
        continue;
      }
      const offset = runs.slice(0, i).reduce((sum, value) => sum + value, 0);
      const center = horizontal
        ? { x: offset + a + b + c / 2, y: fixed }
        : { x: fixed, y: offset + a + b + c / 2 };
      if (center.x < 0 || center.y < 0 || center.x >= width || center.y >= height) {
        continue;
      }
      hits.push({ center, size: module * 7 * step });
    }
  }

  private static isFinderRatio(a: number, b: number, c: number, d: number, e: number): boolean {
    const total = a + b + c + d + e;
    if (total < 21) {
      return false;
    }
    const unit = total / 7;
    const targets = [1, 1, 3, 1, 1];
    const values = [a, b, c, d, e].map((v) => v / unit);
    return values.every((value, index) => Math.abs(value - targets[index]) < 0.6);
  }

  private static clusterHits(hits: FinderHit[]): FinderHit[] {
    const clusters: FinderHit[] = [];
    for (const hit of hits) {
      const existing = clusters.find(
        (item) =>
          Math.hypot(item.center.x - hit.center.x, item.center.y - hit.center.y) <
          Math.max(item.size, hit.size) * 0.5,
      );
      if (existing) {
        existing.center.x = (existing.center.x + hit.center.x) / 2;
        existing.center.y = (existing.center.y + hit.center.y) / 2;
        existing.size = (existing.size + hit.size) / 2;
      } else {
        clusters.push({ center: { ...hit.center }, size: hit.size });
      }
    }
    if (clusters.length < 3) {
      return clusters;
    }
    clusters.sort((a, b) => a.center.y - b.center.y);
    const top = clusters.slice(0, Math.min(6, clusters.length)).sort((a, b) => a.center.x - b.center.x);
    const bottomCandidates = clusters
      .filter((item) => item.center.y > top[0].center.y + 20)
      .sort((a, b) => a.center.x - b.center.x);
    if (top.length < 2 || bottomCandidates.length < 1) {
      return clusters.slice(0, 3);
    }
    return [top[0], top[top.length - 1], bottomCandidates[0]];
  }
}
