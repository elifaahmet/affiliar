const AffiliatePlayer = require("../../models/AffiliatePlayer");
const AffiliateProfile = require("../../models/AffiliateProfile");

async function resolveAffiliate(affiliateCode) {
  if (!affiliateCode) return null;
  const profile = await AffiliateProfile.findOne({
    referralCodes: affiliateCode.trim().toUpperCase(),
  }).lean();
  return profile ? profile.user : null;
}

async function upsertPlayer(operatorId, data, source) {
  const { playerId, affiliateCode, brandId, campaign, subId, country, currency, registeredAt } =
    data;

  if (!playerId) {
    throw Object.assign(new Error("playerId is required"), { status: 400 });
  }

  const affiliateId = await resolveAffiliate(affiliateCode);

  const doc = {
    operatorId,
    brandId: brandId || null,
    affiliateId,
    affiliateCode: affiliateCode ? affiliateCode.trim().toUpperCase() : null,
    campaign: campaign || null,
    subId: subId || null,
    country: country || null,
    currency: currency || null,
    registeredAt: registeredAt ? new Date(registeredAt) : null,
    source,
    importedAt: new Date(),
  };

  await AffiliatePlayer.findOneAndUpdate(
    { operatorId, playerId: String(playerId) },
    { $set: doc, $setOnInsert: { playerId: String(playerId) } },
    { upsert: true, new: true },
  );
}

exports.register = async (req, res) => {
  try {
    const operator = req.affiliateUser;
    if (!operator.operatorId) {
      return res.status(403).json({ error: "Operator only" });
    }
    await upsertPlayer(operator.operatorId, req.body, "realtime");
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.bulkRegister = async (req, res) => {
  try {
    const operator = req.affiliateUser;
    if (!operator.operatorId) {
      return res.status(403).json({ error: "Operator only" });
    }

    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Body must be a non-empty array" });
    }
    if (items.length > 10000) {
      return res.status(400).json({ error: "Max 10000 players per bulk request" });
    }

    const results = { created: 0, failed: [] };
    for (const item of items) {
      try {
        await upsertPlayer(operator.operatorId, item, "bulk");
        results.created++;
      } catch (err) {
        results.failed.push({ playerId: item.playerId, error: err.message });
      }
    }

    res.status(207).json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
