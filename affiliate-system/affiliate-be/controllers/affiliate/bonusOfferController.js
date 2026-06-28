const BonusOffer = require("../../models/BonusOffer");
const AffiliateBonusCode = require("../../models/AffiliateBonusCode");
const BonusClaim = require("../../models/BonusClaim");
const Brand = require("../../models/Brand");
const User = require("../../models/User");
const casinoBonus = require("../../utils/casinoBonus");
const { notify } = require("../../utils/notify");

// Per-affiliate sub-code: base + short affiliate suffix (uppercased).
function makeCode(baseCode, affiliateId) {
  return `${baseCode}-${String(affiliateId).slice(-5).toUpperCase()}`;
}

// Provision one code as a real casino bonus definition. Mutates + saves the doc.
async function provisionCode(offer, codeDoc) {
  if (!casinoBonus.isConfigured()) {
    codeDoc.provision = { status: "pending", externalBonusId: null, error: "casino bonus API not configured", syncedAt: null };
    await codeDoc.save();
    return;
  }
  try {
    const { externalBonusId } = await casinoBonus.createBonusDefinition(offer, codeDoc.code);
    codeDoc.provision = { status: "created", externalBonusId, error: null, syncedAt: new Date() };
  } catch (err) {
    codeDoc.provision = { status: "failed", externalBonusId: null, error: err.message, syncedAt: new Date() };
  }
  await codeDoc.save();
}

const bonusOfferController = {
  // ── Operator ───────────────────────────────────────────────────────────────
  async list(req, res) {
    try {
      const user = req.affiliateUser;
      const offers = await BonusOffer.find({ operatorId: user.operatorId })
        .populate("brandId", "name").sort({ createdAt: -1 }).lean();
      const counts = await AffiliateBonusCode.aggregate([
        { $match: { operatorId: user.operatorId } },
        { $group: { _id: "$offerId", codes: { $sum: 1 }, claims: { $sum: "$claimsCount" } } },
      ]);
      const byOffer = new Map(counts.map((c) => [String(c._id), c]));
      res.json({
        offers: offers.map((o) => ({
          ...o,
          codes: byOffer.get(String(o._id))?.codes || 0,
          claims: byOffer.get(String(o._id))?.claims || 0,
        })),
        provisioning: casinoBonus.isConfigured(),
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async create(req, res) {
    try {
      const user = req.affiliateUser;
      const b = req.body || {};
      if (!b.name || !b.type || !b.baseCode) return res.status(400).json({ error: "name, type and baseCode are required" });
      if (!["deposit_bonus", "free_spins", "cashback"].includes(b.type)) return res.status(400).json({ error: "Invalid type" });
      if (Number(b.wageringMultiplier) < 15) return res.status(400).json({ error: "Wagering multiplier must be at least 15" });
      if (b.brandId) {
        const brand = await Brand.findOne({ _id: b.brandId, operatorId: user.operatorId }).select({ _id: 1 }).lean();
        if (!brand) return res.status(400).json({ error: "Unknown brand" });
      }
      const offer = await BonusOffer.create({
        operatorId: user.operatorId, brandId: b.brandId || null, name: String(b.name).trim(),
        description: b.description || null, type: b.type, currency: b.currency || "EUR",
        wageringMultiplier: Number(b.wageringMultiplier) || 15, validityDays: Number(b.validityDays) || 30,
        percentAmount: b.percentAmount ?? null, minDepositAmount: b.minDepositAmount ?? null, maxBonusAmount: b.maxBonusAmount ?? null,
        freeSpinCount: b.freeSpinCount ?? null, freeSpinGameId: b.freeSpinGameId ?? null, freeSpinValue: b.freeSpinValue ?? null,
        cashbackPercent: b.cashbackPercent ?? null, cashbackMaxAmount: b.cashbackMaxAmount ?? null,
        baseCode: String(b.baseCode).trim().toUpperCase(), status: b.status === "active" ? "active" : "draft",
        createdBy: user._id,
      });
      res.status(201).json({ offer: offer.toObject() });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async update(req, res) {
    try {
      const user = req.affiliateUser;
      const allowed = ["name", "description", "status", "validityDays", "percentAmount", "minDepositAmount",
        "maxBonusAmount", "freeSpinCount", "freeSpinGameId", "freeSpinValue", "cashbackPercent", "cashbackMaxAmount", "wageringMultiplier"];
      const set = {};
      for (const k of allowed) if (k in (req.body || {})) set[k] = req.body[k];
      if (set.status && !["draft", "active", "archived"].includes(set.status)) return res.status(400).json({ error: "Invalid status" });
      const offer = await BonusOffer.findOneAndUpdate({ _id: req.params.id, operatorId: user.operatorId }, { $set: set }, { new: true })
        .populate("brandId", "name").lean();
      if (!offer) return res.status(404).json({ error: "Not found" });
      res.json({ offer });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async remove(req, res) {
    try {
      const user = req.affiliateUser;
      const claims = await BonusClaim.countDocuments({ offerId: req.params.id, operatorId: user.operatorId });
      if (claims > 0) return res.status(400).json({ error: "Offer has claims — archive it instead of deleting." });
      const r = await BonusOffer.deleteOne({ _id: req.params.id, operatorId: user.operatorId });
      if (!r.deletedCount) return res.status(404).json({ error: "Not found" });
      await AffiliateBonusCode.deleteMany({ offerId: req.params.id });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  // Authorize affiliates: mint a per-affiliate code + provision it in the casino.
  async authorize(req, res) {
    try {
      const user = req.affiliateUser;
      const offer = await BonusOffer.findOne({ _id: req.params.id, operatorId: user.operatorId }).lean();
      if (!offer) return res.status(404).json({ error: "Not found" });

      let ids = [];
      if (req.body?.allAffiliates) {
        ids = (await User.find({ role: "affiliate", operatorId: user.operatorId, isDeleted: { $ne: true } }).select("_id").lean()).map((a) => a._id);
      } else if (Array.isArray(req.body?.affiliateIds)) {
        ids = (await User.find({ _id: { $in: req.body.affiliateIds }, role: "affiliate", operatorId: user.operatorId, isDeleted: { $ne: true } }).select("_id").lean()).map((a) => a._id);
      }
      if (!ids.length) return res.status(400).json({ error: "Select at least one affiliate" });

      let created = 0;
      for (const affId of ids) {
        const existing = await AffiliateBonusCode.findOne({ offerId: offer._id, affiliateId: affId });
        if (existing) continue;
        const codeDoc = await AffiliateBonusCode.create({
          offerId: offer._id, operatorId: user.operatorId, affiliateId: affId, code: makeCode(offer.baseCode, affId),
        });
        await provisionCode(offer, codeDoc);
        created += 1;
        notify({
          userId: affId, operatorId: user.operatorId, type: "bonus_available",
          title: `New bonus to share: ${offer.name}`,
          body: `You can now distribute "${offer.name}" to your players. Grab your code & link on the Bonuses page.`,
          link: "/affiliate/bonus-offers",
        });
      }
      res.json({ authorized: created });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async codes(req, res) {
    try {
      const user = req.affiliateUser;
      const offer = await BonusOffer.findOne({ _id: req.params.id, operatorId: user.operatorId }).lean();
      if (!offer) return res.status(404).json({ error: "Not found" });
      const codes = await AffiliateBonusCode.find({ offerId: offer._id }).sort({ createdAt: -1 }).lean();
      const names = new Map(
        (await User.find({ _id: { $in: codes.map((c) => c.affiliateId) } }).select("username name email").lean())
          .map((u) => [String(u._id), u.name || u.username || u.email]),
      );
      res.json({ codes: codes.map((c) => ({ ...c, affiliateName: names.get(String(c.affiliateId)) || String(c.affiliateId) })) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async reprovision(req, res) {
    try {
      const user = req.affiliateUser;
      const codeDoc = await AffiliateBonusCode.findOne({ _id: req.params.codeId, operatorId: user.operatorId });
      if (!codeDoc) return res.status(404).json({ error: "Not found" });
      const offer = await BonusOffer.findById(codeDoc.offerId).lean();
      await provisionCode(offer, codeDoc);
      res.json({ provision: codeDoc.provision });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  // ── Affiliate (mounted under /affiliate-portal/bonus-offers) ─────────────────
  async affiliateList(req, res) {
    try {
      const user = req.affiliateUser;
      if (user.role !== "affiliate") return res.status(403).json({ error: "Affiliates only" });
      const codes = await AffiliateBonusCode.find({ affiliateId: user._id, status: "active" }).lean();
      if (!codes.length) return res.json({ offers: [] });

      const offerIds = codes.map((c) => c.offerId);
      const offers = await BonusOffer.find({ _id: { $in: offerIds }, status: "active" }).populate("brandId", "name url").lean();
      const offerById = new Map(offers.map((o) => [String(o._id), o]));

      const out = codes
        .map((c) => {
          const o = offerById.get(String(c.offerId));
          if (!o) return null;
          const brandUrl = o.brandId?.url || null;
          const link = brandUrl ? `${brandUrl.replace(/\/+$/, "")}/?bonus=${encodeURIComponent(c.code)}` : null;
          return {
            offerId: o._id, name: o.name, description: o.description, type: o.type,
            brandName: o.brandId?.name || null, wageringMultiplier: o.wageringMultiplier, validityDays: o.validityDays,
            percentAmount: o.percentAmount, minDepositAmount: o.minDepositAmount, maxBonusAmount: o.maxBonusAmount,
            freeSpinCount: o.freeSpinCount, cashbackPercent: o.cashbackPercent, currency: o.currency,
            code: c.code, link, claims: c.claimsCount, ready: c.provision?.status === "created",
          };
        })
        .filter(Boolean);
      res.json({ offers: out });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
};

module.exports = bonusOfferController;
