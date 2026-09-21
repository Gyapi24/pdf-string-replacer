export async function readFile(): Promise<never> {
  throw new Error("File paths are not available in the browser. Pass PDF bytes instead.");
}

export async function writeFile(): Promise<never> {
  throw new Error("File paths are not available in the browser.");
}
