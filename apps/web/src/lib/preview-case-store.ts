const encoder = new TextEncoder();
const decoder = new TextDecoder();
const storagePrefix = "silentsignals:encrypted-preview:v1:";

export type PreviewCase = {
  version: 1;
  trackingCode: string;
  status: "received";
  route: "Internal ethics committee" | "Independent oversight";
  category: string;
  urgency: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  evidenceCount: number;
};

type EncryptedEnvelope = {
  version: 1;
  algorithm: "AES-GCM";
  derivation: "PBKDF2-SHA256";
  iterations: 210000;
  salt: string;
  iv: string;
  ciphertext: string;
};

function toBase64(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array<ArrayBufferLike>) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function normalizeAccessKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getStorageKey(trackingCode: string) {
  return `${storagePrefix}${trackingCode.toUpperCase()}`;
}

async function deriveKey(accessKey: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(normalizeAccessKey(accessKey)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: 210000,
      salt: toArrayBuffer(salt),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function isPreviewCase(value: unknown): value is PreviewCase {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<PreviewCase>;
  return (
    candidate.version === 1 &&
    typeof candidate.trackingCode === "string" &&
    candidate.status === "received" &&
    typeof candidate.title === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.evidenceCount === "number"
  );
}

export async function savePreviewCase(previewCase: PreviewCase, accessKey: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(accessKey, salt);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(encoder.encode(previewCase.trackingCode)),
    },
    key,
    toArrayBuffer(encoder.encode(JSON.stringify(previewCase))),
  );
  const envelope: EncryptedEnvelope = {
    version: 1,
    algorithm: "AES-GCM",
    derivation: "PBKDF2-SHA256",
    iterations: 210000,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };

  localStorage.setItem(getStorageKey(previewCase.trackingCode), JSON.stringify(envelope));
}

export async function openPreviewCase(trackingCode: string, accessKey: string) {
  const stored = localStorage.getItem(getStorageKey(trackingCode));

  if (!stored) return null;

  try {
    const envelope = JSON.parse(stored) as Partial<EncryptedEnvelope>;

    if (
      envelope.version !== 1 ||
      envelope.algorithm !== "AES-GCM" ||
      envelope.derivation !== "PBKDF2-SHA256" ||
      envelope.iterations !== 210000 ||
      !envelope.salt ||
      !envelope.iv ||
      !envelope.ciphertext
    ) {
      return null;
    }

    const key = await deriveKey(accessKey, fromBase64(envelope.salt));
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(fromBase64(envelope.iv)),
        additionalData: toArrayBuffer(encoder.encode(trackingCode)),
      },
      key,
      toArrayBuffer(fromBase64(envelope.ciphertext)),
    );
    const parsed = JSON.parse(decoder.decode(plaintext)) as unknown;

    return isPreviewCase(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
