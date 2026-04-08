const crypto = require("crypto");
const ReferralCode = require("../../models/ReferralCode");

const PLAYER_SITE_URL = process.env.PLAYER_SITE_URL || "http://localhost:3000";
const CODE_LENGTH = 8;

function generateRandomCode() {
  // base64url gives URL-safe chars; slice to desired length then uppercase
  return crypto.randomBytes(12).toString("base64url").toUpperCase().slice(0, CODE_LENGTH);
}

async function createUniqueCode() {
  let code;
  let attempts = 0;
  do {
    code = generateRandomCode();
    attempts++;
    if (attempts > 10) throw new Error("Failed to generate a unique code after 10 attempts");
  } while (await ReferralCode.exists({ code }));
  return code;
}

const referralCodeController = {
  // POST /referral-codes
  async create(req, res) {
    try {
      const affiliateUserId = req.affiliateUser._id;
      const { label } = req.body;

      const code = await createUniqueCode();

      const referralCode = await ReferralCode.create({
        code,
        affiliateUserId,
        label: label || null,
      });

      res.status(201).json(referralCode);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // GET /referral-codes
  // Operator can pass ?affiliateUserId= to see a specific affiliate's codes
  async list(req, res) {
    try {
      const requestingUser = req.affiliateUser;
      const isOperator = requestingUser.role === "operator";

      let affiliateUserId;
      if (isOperator && req.query.affiliateUserId) {
        affiliateUserId = req.query.affiliateUserId;
      } else {
        affiliateUserId = requestingUser._id;
      }

      const filter = { affiliateUserId };
      if (req.query.isActive !== undefined) {
        filter.isActive = req.query.isActive === "true";
      }

      const codes = await ReferralCode.find(filter)
        .sort({ createdAt: -1 })
        .lean();

      res.json(codes);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // GET /referral-codes/:id/invite-link
  async getInviteLink(req, res) {
    try {
      const affiliateUserId = req.affiliateUser._id;
      const isOperator = req.affiliateUser.role === "operator";

      const query = isOperator
        ? { _id: req.params.id }
        : { _id: req.params.id, affiliateUserId };

      const referralCode = await ReferralCode.findOne(query).lean();
      if (!referralCode) return res.status(404).json({ error: "Referral code not found" });

      const inviteLink = `${PLAYER_SITE_URL}?ref=${referralCode.code}`;
      res.json({ inviteLink, code: referralCode.code });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // PATCH /referral-codes/:id/activate
  async activate(req, res) {
    try {
      const affiliateUserId = req.affiliateUser._id;
      const referralCode = await ReferralCode.findOneAndUpdate(
        { _id: req.params.id, affiliateUserId },
        { isActive: true },
        { new: true }
      );
      if (!referralCode) return res.status(404).json({ error: "Referral code not found" });
      res.json(referralCode);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // PATCH /referral-codes/:id/deactivate
  async deactivate(req, res) {
    try {
      const affiliateUserId = req.affiliateUser._id;
      const referralCode = await ReferralCode.findOneAndUpdate(
        { _id: req.params.id, affiliateUserId },
        { isActive: false },
        { new: true }
      );
      if (!referralCode) return res.status(404).json({ error: "Referral code not found" });
      res.json(referralCode);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // DELETE /referral-codes/:id
  async remove(req, res) {
    try {
      const affiliateUserId = req.affiliateUser._id;
      const referralCode = await ReferralCode.findOneAndDelete({
        _id: req.params.id,
        affiliateUserId,
      });
      if (!referralCode) return res.status(404).json({ error: "Referral code not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

module.exports = referralCodeController;
