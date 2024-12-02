import crypto from "crypto";

export const createHash = (content: string | Buffer): string => {
  // Create a new hash object
  const hash = crypto.createHash("sha256");
  hash.update(content);
  // Generate the hash in hexadecimal format
  return hash.digest("hex");
};
