import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { requireServerEnv, ServiceConfigurationError } from "@/server/config";

const credentialAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const scryptCost = 32768;
const scryptBlockSize = 8;
const scryptParallelization = 1;
const scryptKeyLength = 64;

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  tag: string;
  version: 1;
};

function randomSegment(length: number) {
  return Array.from({ length }, () => credentialAlphabet[randomInt(credentialAlphabet.length)]).join(
    "",
  );
}

export function generateCaseCredentials() {
  return {
    trackingCode: `SIG-${new Date().getUTCFullYear()}-${randomSegment(4)}-${randomSegment(4)}`,
    accessKey: Array.from({ length: 4 }, () => randomSegment(4)).join(" "),
  };
}

export function normalizeTrackingCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "-").replace(/-+/g, "-");
}

export function normalizeAccessKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function deriveScryptKey(secret: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      secret,
      salt,
      scryptKeyLength,
      {
        N: scryptCost,
        r: scryptBlockSize,
        p: scryptParallelization,
        maxmem: 64 * 1024 * 1024,
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function hashAccessKey(accessKey: string) {
  const normalized = normalizeAccessKey(accessKey);
  const salt = randomBytes(16);
  const hash = await deriveScryptKey(normalized, salt);

  return [
    "scrypt",
    "v1",
    scryptCost,
    scryptBlockSize,
    scryptParallelization,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join(":");
}

export async function hashPassword(password: string) {
  if (password.length < 14) throw new Error("Password must contain at least 14 characters.");

  const salt = randomBytes(16);
  const hash = await deriveScryptKey(password, salt);

  return [
    "scrypt",
    "v1",
    scryptCost,
    scryptBlockSize,
    scryptParallelization,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join(":");
}

export async function verifyAccessKey(accessKey: string, encodedHash: string) {
  const [algorithm, version, cost, blockSize, parallelization, saltValue, hashValue] =
    encodedHash.split(":");

  if (
    algorithm !== "scrypt" ||
    version !== "v1" ||
    Number(cost) !== scryptCost ||
    Number(blockSize) !== scryptBlockSize ||
    Number(parallelization) !== scryptParallelization ||
    !saltValue ||
    !hashValue
  ) {
    return false;
  }

  const expectedHash = Buffer.from(hashValue, "base64url");
  const actualHash = await deriveScryptKey(
    normalizeAccessKey(accessKey),
    Buffer.from(saltValue, "base64url"),
  );

  return expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);
}

export async function verifyPassword(password: string, encodedHash: string) {
  const [algorithm, version, cost, blockSize, parallelization, saltValue, hashValue] =
    encodedHash.split(":");

  if (
    algorithm !== "scrypt" ||
    version !== "v1" ||
    Number(cost) !== scryptCost ||
    Number(blockSize) !== scryptBlockSize ||
    Number(parallelization) !== scryptParallelization ||
    !saltValue ||
    !hashValue
  ) {
    return false;
  }

  const expectedHash = Buffer.from(hashValue, "base64url");
  const actualHash = await deriveScryptKey(password, Buffer.from(saltValue, "base64url"));

  return expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);
}

export async function consumeInvalidPasswordWork(password: string) {
  await deriveScryptKey(password, Buffer.from("SilentSignalsAuth", "utf8"));
}

export function generateOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function consumeInvalidCredentialWork(accessKey: string) {
  const fixedSalt = Buffer.from("SilentSignalsV1!", "utf8");
  await deriveScryptKey(normalizeAccessKey(accessKey), fixedSalt);
}

function getEncryptionKey() {
  const encodedKey = requireServerEnv("REPORT_ENCRYPTION_KEY");
  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== 32) {
    throw new ServiceConfigurationError("REPORT_ENCRYPTION_KEY must decode to 32 bytes.");
  }

  return key;
}

export function encryptPayload(value: unknown): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    version: 1,
  };
}

export function decryptPayload<Value>(payload: EncryptedPayload): Value {
  if (payload.version !== 1) {
    throw new Error("Unsupported encryption version.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(payload.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64url")),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf8")) as Value;
}

export function createAccessScope(trackingCode: string, clientAddress: string) {
  return createHmac("sha256", requireServerEnv("RATE_LIMIT_SECRET"))
    .update(`${normalizeTrackingCode(trackingCode)}:${clientAddress}`)
    .digest("hex");
}

export function createSecurityScope(...values: string[]) {
  return createHmac("sha256", requireServerEnv("RATE_LIMIT_SECRET"))
    .update(values.map((value) => value.trim().toLowerCase()).join(":"))
    .digest("hex");
}
