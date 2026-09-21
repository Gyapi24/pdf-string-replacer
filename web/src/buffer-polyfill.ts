import { Buffer } from "buffer";

const globalScope = globalThis as typeof globalThis & { Buffer: typeof Buffer };
globalScope.Buffer = Buffer;
