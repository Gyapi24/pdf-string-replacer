function rotl(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function sha1(data: Uint8Array): Uint8Array {
  const length = data.length;
  const paddedLength = Math.ceil((length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, length * 8, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      words[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i += 1) {
      words[i] = rotl(words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i += 1) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + words[i]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const digest = new Uint8Array(20);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, h0, false);
  digestView.setUint32(4, h1, false);
  digestView.setUint32(8, h2, false);
  digestView.setUint32(12, h3, false);
  digestView.setUint32(16, h4, false);
  return digest;
}

function toBytes(data: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

class BrowserHash {
  private chunks: Uint8Array[] = [];

  constructor(private readonly algorithm: string) {}

  update(data: Uint8Array | ArrayBuffer | string): this {
    this.chunks.push(toBytes(data));
    return this;
  }

  digest(encoding?: "hex" | "binary"): Uint8Array | string {
    if (this.algorithm !== "sha1") {
      throw new Error(
        `Hash "${this.algorithm}" is not available in the browser. Encrypted PDFs are not supported here.`
      );
    }
    const length = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const digest = sha1(merged);
    return encoding === "hex" ? toHex(digest) : digest;
  }
}

export function createHash(algorithm: string): BrowserHash {
  return new BrowserHash(algorithm.toLowerCase());
}

export function randomBytes(_size: number): never {
  throw new Error("Encrypted PDF write is not supported in the browser.");
}

export function createCipheriv(): never {
  throw new Error("PDF encryption is not supported in the browser.");
}

export function createDecipheriv(): never {
  throw new Error("PDF encryption is not supported in the browser.");
}
