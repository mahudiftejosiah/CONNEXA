import { createHash, timingSafeEqual } from "node:crypto";

export type HashAlgorithm = {
  id: string;
  label: string;
  bytes: number;
  warning?: string | null;
};

// Everything this runtime's OpenSSL provider can actually produce. Digest length
// is what makes two algorithms look identical to a reader, so it is recorded
// here and used by identify().
export const HASH_ALGORITHMS: HashAlgorithm[] = [
  { id: "md5", label: "MD5", bytes: 16, warning: "Broken since 2004. Fine for checksums, never for secrets." },
  { id: "sha1", label: "SHA-1", bytes: 20, warning: "Collisions are public. Legacy use only." },
  { id: "sha224", label: "SHA-224", bytes: 28 },
  { id: "sha256", label: "SHA-256", bytes: 32 },
  { id: "sha384", label: "SHA-384", bytes: 48 },
  { id: "sha512", label: "SHA-512", bytes: 64 },
  { id: "sha3-224", label: "SHA3-224", bytes: 28 },
  { id: "sha3-256", label: "SHA3-256", bytes: 32 },
  { id: "sha3-384", label: "SHA3-384", bytes: 48 },
  { id: "sha3-512", label: "SHA3-512", bytes: 64 },
  { id: "ripemd160", label: "RIPEMD-160", bytes: 20 },
  { id: "sm3", label: "SM3 (China's GB/T 32905)", bytes: 32 },
  { id: "blake2b512", label: "BLAKE2b-512", bytes: 64 },
];

export const DEFAULT_ALGORITHM = "sha256";

export function algorithmById(id: string): HashAlgorithm | undefined {
  return HASH_ALGORITHMS.find((a) => a.id === id);
}

// A serverless runtime can ship without every provider, so ask OpenSSL rather
// than assume.
export function digestHex(id: string, text: string): string | null {
  try {
    return createHash(id).update(text, "utf8").digest("hex");
  } catch {
    return null;
  }
}

export function supportedAlgorithms(text = ""): HashAlgorithm[] {
  return HASH_ALGORITHMS.filter((a) => digestHex(a.id, text || "probe") !== null);
}

const HEX = /^[0-9a-fA-F]+$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type ParsedHash = { bytes: Buffer; format: "hex" | "base64" };

export function parseHash(input: string): ParsedHash | { error: string } {
  const value = input.trim();
  if (!value) return { error: "Paste the hash you want to work with." };
  if (value.length > 512) return { error: "That is far longer than any hash listed here." };
  if (HEX.test(value) && value.length % 2 === 0) {
    return { bytes: Buffer.from(value, "hex"), format: "hex" };
  }
  if (BASE64.test(value) && value.length % 4 === 0) {
    const bytes = Buffer.from(value, "base64");
    if (bytes.toString("base64") === value) return { bytes, format: "base64" };
  }
  return { error: "That string is not hexadecimal or base64, so it is not a hash this tool knows." };
}

export function candidatesFor(bytes: number): HashAlgorithm[] {
  return HASH_ALGORITHMS.filter((a) => a.bytes === bytes);
}

export function verifyAgainst(algorithm: string, hash: ParsedHash, original: string): boolean {
  const digest = digestHex(algorithm, original);
  if (digest === null) return false;
  const produced = Buffer.from(digest, "hex");
  return produced.length === hash.bytes.length && timingSafeEqual(produced, hash.bytes);
}
