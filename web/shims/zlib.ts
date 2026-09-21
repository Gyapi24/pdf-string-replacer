import { deflate } from "pako";

/** zlib-wrapped deflate, matching Node's `deflateSync`. */
export function deflateSync(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  return deflate(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}
