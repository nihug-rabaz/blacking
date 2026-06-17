export class ReedSolomonCodec {
  private readonly divisor: Uint8Array;

  constructor(private readonly parityCount: number) {
    this.divisor = ReedSolomonCodec.buildDivisor(parityCount);
  }

  encode(data: Uint8Array): Uint8Array {
    const remainder = new Uint8Array(this.parityCount);
    for (let i = 0; i < data.length; i++) {
      const factor = remainder[0] ^ data[i];
      remainder.copyWithin(0, 1);
      remainder[this.parityCount - 1] = 0;
      for (let j = 0; j < this.parityCount; j++) {
        remainder[j] ^= Gf.mul(this.divisor[j], factor);
      }
    }
    const codeword = new Uint8Array(data.length + this.parityCount);
    codeword.set(data);
    codeword.set(remainder, data.length);
    return codeword;
  }

  decode(received: Uint8Array): Uint8Array | null {
    const syndromes = this.calcSyndromes(received);
    if (syndromes.every((value) => value === 0)) {
      return received.slice(0, received.length - this.parityCount);
    }
    const locator = BerlekampMassey.solve(syndromes);
    if (!locator || locator.length < 2) {
      return null;
    }
    const positions = ChienSearch.run(locator, received.length);
    if (!positions || positions.length !== locator.length - 1) {
      return null;
    }
    const corrected = new Uint8Array(received);
    const omega = OmegaPoly.compute(syndromes, locator);
    const formal = FormalDerivative.compute(locator);
    for (const pos of positions) {
      const xInv = Gf.exp[255 - ((received.length - 1 - pos) % 255)];
      let omegaVal = 0;
      let formalVal = 0;
      for (let i = 0; i < omega.length; i++) {
        omegaVal ^= Gf.mul(omega[i], Gf.exp[(i * Gf.log[xInv]) % 255]);
      }
      for (let i = 0; i < formal.length; i++) {
        formalVal ^= Gf.mul(formal[i], Gf.exp[(i * Gf.log[xInv]) % 255]);
      }
      if (formalVal === 0) {
        return null;
      }
      corrected[pos] ^= Gf.div(omegaVal, formalVal);
    }
    const verify = this.calcSyndromes(corrected);
    if (!verify.every((value) => value === 0)) {
      return null;
    }
    return corrected.slice(0, corrected.length - this.parityCount);
  }

  private calcSyndromes(data: Uint8Array): Uint8Array {
    const syndromes = new Uint8Array(this.parityCount);
    for (let i = 0; i < this.parityCount; i++) {
      let syndrome = 0;
      for (let j = 0; j < data.length; j++) {
        syndrome = Gf.mul(syndrome, Gf.exp[i]) ^ data[j];
      }
      syndromes[i] = syndrome;
    }
    return syndromes;
  }

  private static buildDivisor(degree: number): Uint8Array {
    const result = new Uint8Array(degree);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = Gf.mul(result[j], root);
        if (j + 1 < result.length) {
          result[j] ^= result[j + 1];
        }
      }
      root = Gf.mul(root, 2);
    }
    return result;
  }
}

class Gf {
  static readonly exp = Gf.buildExp();
  static readonly log = Gf.buildLog();

  static mul(a: number, b: number): number {
    if (a === 0 || b === 0) {
      return 0;
    }
    return Gf.exp[(Gf.log[a] + Gf.log[b]) % 255];
  }

  static div(a: number, b: number): number {
    if (a === 0) {
      return 0;
    }
    return Gf.exp[(Gf.log[a] - Gf.log[b] + 255) % 255];
  }

  static polyMul(a: number[], b: number[]): number[] {
    const out = new Array(a.length + b.length - 1).fill(0);
    for (let i = 0; i < a.length; i++) {
      if (a[i] === 0) {
        continue;
      }
      for (let j = 0; j < b.length; j++) {
        if (b[j] === 0) {
          continue;
        }
        out[i + j] ^= Gf.mul(a[i], b[j]);
      }
    }
    return out;
  }

  private static buildExp(): Uint8Array {
    const exp = new Uint8Array(512);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      exp[i] = x;
      x <<= 1;
      if (x & 0x100) {
        x ^= 0x11d;
      }
    }
    for (let i = 255; i < 512; i++) {
      exp[i] = exp[i - 255];
    }
    return exp;
  }

  private static buildLog(): Uint8Array {
    const log = new Uint8Array(256);
    for (let i = 0; i < 255; i++) {
      log[Gf.exp[i]] = i;
    }
    return log;
  }
}

class BerlekampMassey {
  static solve(syndromes: Uint8Array): number[] | null {
    const c = [1];
    const b = [1];
    let l = 0;
    let m = 1;
    let bDiscrepancy = 1;
    for (let n = 0; n < syndromes.length; n++) {
      let discrepancy = syndromes[n];
      for (let i = 1; i <= l; i++) {
        discrepancy ^= Gf.mul(c[i], syndromes[n - i]);
      }
      if (discrepancy === 0) {
        m++;
      } else if (2 * l <= n) {
        const temp = [...c];
        const scale = Gf.div(discrepancy, bDiscrepancy);
        while (c.length < b.length + m) {
          c.push(0);
        }
        for (let i = 0; i < b.length; i++) {
          c[i + m] ^= Gf.mul(scale, b[i]);
        }
        l = n + 1 - l;
        b.length = 0;
        b.push(...temp);
        bDiscrepancy = discrepancy;
        m = 1;
      } else {
        const scale = Gf.div(discrepancy, bDiscrepancy);
        while (c.length < b.length + m) {
          c.push(0);
        }
        for (let i = 0; i < b.length; i++) {
          c[i + m] ^= Gf.mul(scale, b[i]);
        }
        m++;
      }
    }
    return c;
  }
}

class ChienSearch {
  static run(locator: number[], length: number): number[] | null {
    const positions: number[] = [];
    for (let i = 0; i < length; i++) {
      let sum = 0;
      for (let j = 0; j < locator.length; j++) {
        sum ^= Gf.mul(locator[j], Gf.exp[(j * i) % 255]);
      }
      if (sum === 0) {
        positions.push(length - 1 - i);
      }
    }
    return positions;
  }
}

class OmegaPoly {
  static compute(syndromes: Uint8Array, locator: number[]): number[] {
    const reversed = [...locator].reverse();
    return Gf.polyMul(Array.from(syndromes), reversed).slice(0, locator.length - 1);
  }
}

class FormalDerivative {
  static compute(poly: number[]): number[] {
    const out: number[] = [];
    for (let i = 1; i < poly.length; i += 2) {
      out.push(poly[i]);
    }
    return out.length ? out : [0];
  }
}
