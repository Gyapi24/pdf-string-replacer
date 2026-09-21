export function dirname(filePath: string): string {
  const index = filePath.replaceAll("\\", "/").lastIndexOf("/");
  return index === -1 ? "." : filePath.slice(0, index);
}

export function join(...parts: string[]): string {
  return parts.filter(Boolean).join("/").replaceAll("//", "/");
}
