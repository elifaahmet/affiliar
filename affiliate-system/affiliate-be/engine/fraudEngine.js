"use strict";

const mongoose = require("mongoose");
const AffiliatePlayer = require("../models/AffiliatePlayer");

// Fingerprint fields and the flag reason each one trips.
const FINGERPRINTS = [
  ["ipHash", "shared_ip"],
  ["deviceHash", "shared_device"],
  ["walletHash", "shared_wallet"],
];

// Default: 4+ distinct players under ONE affiliate sharing the same IP/device/
// wallet looks like self-referral / incentivised fraud (a household is usually
// ≤ 3). Operator-tunable via the scan call.
const DEFAULT_THRESHOLD = 4;

/**
 * Scan an operator's affiliate players for shared-fingerprint clusters and
 * flag the members. A cluster = ≥ threshold distinct players attributed to the
 * SAME affiliate that share one fingerprint value. Flagging is sticky (a later
 * scan won't unflag); operators clear flags from the review screen.
 *
 * Returns { threshold, clusters, flaggedPlayers }.
 */
async function scanOperatorFraud(operatorId, { threshold = DEFAULT_THRESHOLD } = {}) {
  const opId = new mongoose.Types.ObjectId(String(operatorId));
  const flagged = new Set();
  let clusters = 0;

  for (const [field, reason] of FINGERPRINTS) {
    const groups = await AffiliatePlayer.aggregate([
      { $match: { operatorId: opId, affiliateId: { $ne: null }, [field]: { $nin: [null, ""] } } },
      { $group: { _id: { affiliateId: "$affiliateId", fp: `$${field}` }, players: { $addToSet: "$playerId" } } },
      // array has >= threshold elements ⇔ index (threshold-1) exists
      { $match: { [`players.${threshold - 1}`]: { $exists: true } } },
    ]);

    for (const g of groups) {
      clusters++;
      await AffiliatePlayer.updateMany(
        { operatorId: opId, affiliateId: g._id.affiliateId, playerId: { $in: g.players } },
        { $set: { fraudFlagged: true, lastFraudFlag: reason, lastFraudFlagAt: new Date() } },
      );
      g.players.forEach((p) => flagged.add(p));
    }
  }

  return { threshold, clusters, flaggedPlayers: flagged.size };
}

module.exports = { scanOperatorFraud, DEFAULT_THRESHOLD };
