const crypto = require("crypto");

const ENCRYPTION_PREFIX = "enc:v1:";
let cachedKey;

const getKey = () => {
  if (cachedKey) return cachedKey;

  const keyMaterial = process.env.DATA_ENCRYPTION_KEY;
  if (!keyMaterial) {
    throw new Error("DATA_ENCRYPTION_KEY env var is required for field encryption");
  }

  // Always derive a 32-byte key from the provided secret
  cachedKey = crypto.createHash("sha256").update(keyMaterial).digest();
  return cachedKey;
};

const encrypt = (value) => {
  if (value === null || value === undefined) return value;
  const key = getKey();
  const iv = crypto.randomBytes(12); // Recommended IV length for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
};

const decrypt = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  if (!value.startsWith(ENCRYPTION_PREFIX)) return value;

  const [, ivB64, tagB64, dataB64] = value.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return value;

  const key = getKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
};

const encryptIfNeeded = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" && value.startsWith(ENCRYPTION_PREFIX)) {
    return value; // Already encrypted
  }
  return encrypt(value);
};

module.exports = {
  ENCRYPTION_PREFIX,
  encrypt,
  decrypt,
  encryptIfNeeded,
};
