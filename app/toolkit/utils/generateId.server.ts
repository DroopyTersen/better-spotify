import crypto from "crypto";

export function generateId(length: number = 12, prefix: string = ""): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";

  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    const index = bytes[i] % chars.length;
    id += chars[index];
  }

  return `${prefix}${id}`?.toUpperCase();
}
