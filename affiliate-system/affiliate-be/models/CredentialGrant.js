"use strict";

// A one-time delivery of integration credentials.
//
// Approval emails carry a link to one of these rather than the credentials
// themselves. A secret pasted into an email lives in the recipient's mailbox
// forever, gets forwarded, and turns up in backups — and a Kafka password is
// exactly the sort of thing that then sits in a shared inbox for years.
//
// The payload is encrypted at rest with DATA_ENCRYPTION_KEY, readable exactly
// once, and expires whether or not it is read.

const mongoose = require("mongoose");
const { encrypt, decrypt } = require("../utils/fieldEncryption");

const credentialGrantSchema = new mongoose.Schema(
  {
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
    },
    // Random, unguessable, and the only thing that appears in the email.
    token: { type: String, required: true, unique: true, index: true },

    // The credentials, encrypted. Never stored or logged in the clear.
    payloadEncrypted: { type: String, required: true },

    // Short by design: an unread grant is a live secret, and a link that
    // works for a month is one that leaks for a month.
    expiresAt: { type: Date, required: true, index: true },

    // Set the moment it is read. A second read gets nothing — if the
    // recipient never saw it, that is a signal worth acting on, not something
    // to paper over by allowing repeats.
    revealedAt: { type: Date, default: null },
    revealedIp: { type: String, default: null },
  },
  { timestamps: true },
);

credentialGrantSchema.statics.issue = async function issue(operatorId, payload, ttlHours = 72) {
  const crypto = require("crypto");
  const token = crypto.randomBytes(32).toString("hex");
  await this.create({
    operatorId,
    token,
    payloadEncrypted: encrypt(JSON.stringify(payload)),
    expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
  });
  return token;
};

// Returns the payload once, then never again. Callers get null for expired,
// already-read or unknown tokens alike — distinguishing them would tell
// someone probing tokens which ones exist.
credentialGrantSchema.statics.reveal = async function reveal(token, ip) {
  const grant = await this.findOneAndUpdate(
    { token, revealedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revealedAt: new Date(), revealedIp: ip || null } },
    { new: false },
  );
  if (!grant) return null;
  return JSON.parse(decrypt(grant.payloadEncrypted));
};

module.exports = mongoose.model("CredentialGrant", credentialGrantSchema);
