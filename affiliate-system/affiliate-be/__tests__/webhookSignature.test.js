// The signature format is a published contract (docs/refer-a-friend/WEBHOOK.md
// §3) — operators have verifiers written against it. These tests pin the wire
// format so a refactor can't silently change what we send.

const crypto = require("crypto");

process.env.DATA_ENCRYPTION_KEY =
  process.env.DATA_ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");

const { encrypt } = require("../utils/fieldEncryption");
const {
  buildSignature,
  generateSecret,
  liveSecrets,
  ROTATION_GRACE_MS,
} = require("../utils/webhookSignature");

/** The verifier from WEBHOOK.md §3, transcribed from Python to JS. */
function verifyAsOperatorWould(header, rawBody, secret, maxAgeSeconds = 300) {
  const parts = Object.create(null);
  const v1 = [];
  for (const p of header.split(",")) {
    const [k, v] = p.split("=", 2);
    if (k === "v1") v1.push(v);
    else parts[k] = v;
  }
  const t = Number(parts.t);
  if (!Number.isFinite(t)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > maxAgeSeconds) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${rawBody}`, "utf8")
    .digest("hex");
  return v1.includes(expected);
}

const entry = (plain, retiredAt = null) => ({
  secret: encrypt(plain),
  hint: plain.slice(-4),
  createdAt: new Date(),
  retiredAt,
});

describe("webhook signature", () => {
  const body = JSON.stringify({ id: "evt_1", type: "referral.reward.issued" });

  test("produces a header the documented verifier accepts", () => {
    const { plain } = generateSecret();
    const ts = Math.floor(Date.now() / 1000);

    const header = buildSignature(body, [entry(plain)], ts);

    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifyAsOperatorWould(header, body, plain)).toBe(true);
  });

  test("signature covers the body — a tampered payload fails", () => {
    const { plain } = generateSecret();
    const ts = Math.floor(Date.now() / 1000);
    const header = buildSignature(body, [entry(plain)], ts);

    const tampered = JSON.stringify({ id: "evt_1", type: "referral.reward.issued", extra: 1 });
    expect(verifyAsOperatorWould(header, tampered, plain)).toBe(false);
  });

  test("signature covers the timestamp — a replayed t fails", () => {
    const { plain } = generateSecret();
    const ts = Math.floor(Date.now() / 1000);
    const header = buildSignature(body, [entry(plain)], ts);

    // Attacker moves the clock forward to defeat the freshness window but
    // can't recompute the digest without the secret.
    const forged = header.replace(/^t=\d+/, `t=${ts + 600}`);
    expect(verifyAsOperatorWould(forged, body, plain)).toBe(false);
  });

  test("a different secret does not validate", () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = buildSignature(body, [entry(generateSecret().plain)], ts);
    expect(verifyAsOperatorWould(header, body, generateSecret().plain)).toBe(false);
  });

  describe("rotation", () => {
    test("both old and new secrets verify during the grace window", () => {
      const oldSecret = generateSecret().plain;
      const newSecret = generateSecret().plain;
      const ts = Math.floor(Date.now() / 1000);

      const header = buildSignature(
        body,
        [entry(oldSecret, new Date()), entry(newSecret)],
        ts,
      );

      // Two v1= values — this is what lets an operator deploy the new secret
      // without a coordinated cutover.
      expect(header.match(/v1=/g)).toHaveLength(2);
      expect(verifyAsOperatorWould(header, body, oldSecret)).toBe(true);
      expect(verifyAsOperatorWould(header, body, newSecret)).toBe(true);
    });

    test("a secret retired past the grace window stops signing", () => {
      const stale = generateSecret().plain;
      const current = generateSecret().plain;
      const longAgo = new Date(Date.now() - ROTATION_GRACE_MS - 1000);
      const ts = Math.floor(Date.now() / 1000);

      const entries = [entry(stale, longAgo), entry(current)];
      expect(liveSecrets(entries)).toHaveLength(1);

      const header = buildSignature(body, entries, ts);
      expect(header.match(/v1=/g)).toHaveLength(1);
      expect(verifyAsOperatorWould(header, body, stale)).toBe(false);
      expect(verifyAsOperatorWould(header, body, current)).toBe(true);
    });
  });
});
