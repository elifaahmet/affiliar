"use strict";

const AffiliatePlayer = require("../../models/AffiliatePlayer");
const User = require("../../models/User");
const { scanOperatorFraud } = require("../../engine/fraudEngine");
const { notifyOperatorOwners } = require("../../utils/notify");

function operatorOnly(req, res) {
  const user = req.affiliateUser;
  if (!user || user.role !== "operator") {
    res.status(403).json({ error: "Operators only" });
    return null;
  }
  if (!user.operatorId) {
    res.status(400).json({ error: "Operator account is not linked to an operator record" });
    return null;
  }
  return user;
}

// POST /fraud/scan — run the shared-fingerprint scan for this operator and
// flag the offending players. Optional body { threshold }.
exports.scan = async (req, res) => {
  const operator = operatorOnly(req, res);
  if (!operator) return;
  try {
    const threshold = Math.max(2, Number(req.body?.threshold) || 4);
    const result = await scanOperatorFraud(operator.operatorId, { threshold });
    if (result.flaggedPlayers > 0) {
      notifyOperatorOwners(operator.operatorId, {
        type: "fraud_flagged",
        title: "Fraud scan flagged players",
        body: `${result.flaggedPlayers} player(s) across ${result.clusters} cluster(s) share an IP/device under one affiliate.`,
        link: "/reports/fraud",
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /fraud?reason=&affiliateId=&limit= — flagged players with their affiliate.
exports.list = async (req, res) => {
  const operator = operatorOnly(req, res);
  if (!operator) return;
  try {
    const filter = { operatorId: operator.operatorId, fraudFlagged: true };
    if (req.query.reason) filter.lastFraudFlag = String(req.query.reason);
    if (req.query.affiliateId) filter.affiliateId = req.query.affiliateId;
    const lim = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

    const players = await AffiliatePlayer.find(filter)
      .select({ playerId: 1, affiliateId: 1, affiliateCode: 1, lastFraudFlag: 1, lastFraudFlagAt: 1, country: 1, registeredAt: 1 })
      .sort({ lastFraudFlagAt: -1 })
      .limit(lim)
      .lean();

    // Hydrate affiliate identity for display.
    const affIds = [...new Set(players.map((p) => String(p.affiliateId)).filter(Boolean))];
    const affs = affIds.length
      ? await User.find({ _id: { $in: affIds } }).select({ username: 1, email: 1, name: 1 }).lean()
      : [];
    const affMap = new Map(affs.map((a) => [String(a._id), a]));

    res.json({
      count: players.length,
      players: players.map((p) => {
        const a = affMap.get(String(p.affiliateId));
        return {
          playerId: p.playerId,
          affiliateId: p.affiliateId ? String(p.affiliateId) : null,
          affiliate: a ? (a.name || a.username || a.email) : (p.affiliateCode || "—"),
          affiliateCode: p.affiliateCode || null,
          reason: p.lastFraudFlag || null,
          flaggedAt: p.lastFraudFlagAt || null,
          country: p.country || null,
          registeredAt: p.registeredAt || null,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /fraud/:playerId — operator override: set/clear the fraud flag on one
// of their players (dismiss a false positive, or flag manually).
exports.setFlag = async (req, res) => {
  const operator = operatorOnly(req, res);
  if (!operator) return;
  try {
    const flagged = !!req.body?.flagged;
    const player = await AffiliatePlayer.findOneAndUpdate(
      { operatorId: operator.operatorId, playerId: String(req.params.playerId) },
      {
        $set: {
          fraudFlagged: flagged,
          lastFraudFlag: flagged ? "manual" : null,
          lastFraudFlagAt: flagged ? new Date() : null,
        },
      },
      { new: true, select: { playerId: 1, fraudFlagged: 1 } },
    ).lean();
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json({ playerId: player.playerId, fraudFlagged: player.fraudFlagged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
