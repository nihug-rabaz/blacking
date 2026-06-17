export class SymbolCodec {
  static bytesToSymbols(bytes: Uint8Array): number[] {
    const symbols: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < bytes.length; i++) {
      buffer = (buffer << 8) | bytes[i];
      bits += 8;
      while (bits >= 3) {
        bits -= 3;
        symbols.push((buffer >> bits) & 7);
      }
    }
    if (bits > 0) {
      symbols.push((buffer << (3 - bits)) & 7);
    }
    return symbols;
  }

  static symbolsToBytes(symbols: number[]): Uint8Array {
    const bytes: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const symbol of symbols) {
      buffer = (buffer << 3) | (symbol & 7);
      bits += 3;
      while (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
      }
    }
    return new Uint8Array(bytes);
  }
}
