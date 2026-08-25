const User = require("../../models/User");
const AffiliateProfile = require("../../models/AffiliateProfile");
const CommissionPlan = require("../../models/CommissionPlan");
const Brand = require("../../models/Brand");
const Operator = require("../../models/Operator");
const { sendAffiliateInvite } = require("../../utils/mailer");
const { wouldCreateCycle } = require("../../utils/affiliateHierarchy");
const { cloneOperatorDefaultsForBrand } = require("../../utils/brandDefaults");
const { notifyOperatorOwners } = require("../../utils/notify");

function generateAffiliateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function uniqueAffiliateCode() {
  let code, attempts = 0;
  do {
    code = generateAffiliateCode();
    attempts++;
  } while (
    (await AffiliateProfile.findOne({ referralCodes: code })) && attempts < 10
  );
  return code;
}

/**
 * Create a single affiliate (operator-initiated, no password yet).
 * status: "pending" — affiliate must activate via /auth/activate
 *
 * Operator must have at least one Brand. We auto-generate one referral code per
 * brand so the affiliate can share the right link for each brand they promote.
 */
async function createAffiliate(operatorUser, body) {
  const { email, username, name, mobileNumber, mobileCountryCode, website, brandIds } = body;

  if (!email || !username || !name) {
    throw Object.assign(new Error("email, username and name are required"), { status: 400 });
  }

  // Operator must have at least one brand before creating affiliates
  const allBrands = await Brand.find({
    operatorId: operatorUser.operatorId,
    enabled: true,
  }).lean();
  if (allBrands.length === 0) {
    throw Object.assign(
      new Error("You must create at least one brand before adding affiliates"),
      { status: 400 },
    );
  }

  // Resolve which brands to assign: explicit list from body, or all if none provided
  let brands;
  if (Array.isArray(brandIds) && brandIds.length > 0) {
    const wanted = new Set(brandIds.map(String));
    brands = allBrands.filter((b) => wanted.has(String(b._id)));
    if (brands.length === 0) {
      throw Object.assign(
        new Error("None of the selected brands belong to your operator"),
        { status: 400 },
      );
    }
  } else {
    brands = allBrands;
  }

  // Every brand this affiliate is being given must have its public URL on
  // file. It is the base of their tracking link — without it the portal has
  // nothing to build on and the affiliate is left with a code they can't use.
  // Refusing here is kinder than inviting someone into a broken portal.
  const brandsWithoutUrl = brands.filter((b) => !String(b.url || "").trim());
  if (brandsWithoutUrl.length > 0) {
    const names = brandsWithoutUrl.map((b) => b.name).join(", ");
    throw Object.assign(
      new Error(
        `Set the website URL for ${names} before inviting affiliates — it's the base of every tracking link. ` +
          `Add it under Brands, then try again.`,
      ),
      { status: 400, code: "BRAND_URL_REQUIRED", brands: brandsWithoutUrl.map((b) => String(b._id)) },
    );
  }

  const existing = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username }],
    isDeleted: false,
  });
  if (existing) {
    throw Object.assign(new Error(`Email or username already taken: ${email}`), { status: 409 });
  }

  const user = await User.create({
    email: email.toLowerCase(),
    username,
    name,
    password: "PENDING",   // unusable until activated
    role: "affiliate",
    status: "pending",
    operatorId: operatorUser.operatorId, // Operator collection _id, same as list filter
    mobileNumber: mobileNumber || null,
    mobileCountryCode: mobileCountryCode || null,
    website: (typeof website === "string" && website.trim()) ? website.trim() : null,
    isDeleted: false,
  });

  // One unique referral code per brand
  const brandCodes = [];
  const allCodes = [];
  for (const brand of brands) {
    const code = await uniqueAffiliateCode();
    brandCodes.push({ code, brandId: brand._id });
    allCodes.push(code);
  }

  // Assign default commission plan if one exists for this operator
  const defaultPlan = await CommissionPlan.findOne({
    operatorId: operatorUser.operatorId,
    isDefault: true,
    isActive: { $ne: false },
  }).lean();

  await AffiliateProfile.create({
    user: user._id,
    referralCodes: allCodes,
    brandCodes,
    operatorUser: operatorUser._id,
    commissionPlanId: defaultPlan?._id ?? null,
  });

  // Send invite email (non-blocking — failure doesn't roll back creation)
  try {
    const operator = await Operator.findById(operatorUser.operatorId).lean();
    await sendAffiliateInvite({
      to: user.email,
      name: user.name,
      userId: user._id.toString(),
      operatorName: operator?.name,
    });
  } catch (mailErr) {
    // eslint-disable-next-line no-console
    console.error("affiliate.invite.mail_failed", mailErr.message);
  }

  notifyOperatorOwners(operatorUser.operatorId, {
    type: "new_affiliate",
    title: "New affiliate joined",
    body: `${user.name || user.username || user.email} signed up as an affiliate.`,
    link: "/affiliates",
  });

  return { user, affiliateCode: allCodes[0], allCodes, brandCodes };
}

const affiliateController = {
  // GET /affiliates
  // Operator sees all affiliates that belong to them
  async list(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") {
        return res.status(403).json({ error: "Only operators can list affiliates" });
      }

      const { brandId, status, search, page = 1, limit = 50 } = req.query;

      const filter = {
        role: "affiliate",
        isDeleted: { $ne: true },
        operatorId: operator.operatorId,
      };

      if (brandId) filter.brandId = brandId;
      if (status) filter.status = status;
      if (search) {
        filter.$or = [
          { username: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } },
        ];
      }

      // Brand-scoped operator users only see affiliates that carry a brand
      // code for one of their brands (affiliate↔brand link lives on
      // AffiliateProfile.brandCodes). Owners (no brandIds) see everyone.
      if (Array.isArray(operator.brandIds) && operator.brandIds.length > 0) {
        const scopedProfiles = await AffiliateProfile.find({
          "brandCodes.brandId": { $in: operator.brandIds },
        })
          .select({ user: 1 })
          .lean();
        filter._id = { $in: scopedProfiles.map((p) => p.user) };
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [affiliates, total] = await Promise.all([
        User.find(filter)
          .select("-password -twoFactorSecret")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        User.countDocuments(filter),
      ]);

      // Attach commission plan info from AffiliateProfile
      const userIds = affiliates.map((a) => a._id);
      const profiles = await AffiliateProfile.find({ user: { $in: userIds } })
        .populate("commissionPlanId", "_id name type product")
        .populate("commissionPlans.casino",     "_id name type product")
        .populate("commissionPlans.sportsbook", "_id name type product")
        .populate("commissionPlans.combined",   "_id name type product")
        .populate("parentAffiliate", "_id username email name")
        .select("user commissionPlanId commissionPlans referralCodes parentAffiliate overrideRate")
        .lean();

      const profileMap = new Map(profiles.map((p) => [String(p.user), p]));

      const enriched = affiliates.map((a) => {
        const profile = profileMap.get(String(a._id));
        return {
          ...a,
          referralCodes:    profile?.referralCodes    ?? [],
          commissionPlanId: profile?.commissionPlanId ?? null,
          commissionPlans:  profile?.commissionPlans  ?? { casino: null, sportsbook: null, combined: null },
          parentAffiliate:  profile?.parentAffiliate  ?? null,
          overrideRate:     profile?.overrideRate      ?? 0,
        };
      });

      res.json({ affiliates: enriched, total, page: Number(page), limit: Number(limit) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // GET /affiliates/:id
  async getOne(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") {
        return res.status(403).json({ error: "Only operators can view affiliate details" });
      }

      const affiliate = await User.findOne({
        _id: req.params.id,
        role: "affiliate",
        isDeleted: false,
      })
        .populate("brandId", "id name")
        .populate("parentAffiliate", "id username email")
        .select("-password -twoFactorSecret")
        .lean();

      if (!affiliate) return res.status(404).json({ error: "Affiliate not found" });

      res.json(affiliate);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // GET /affiliates/brands
  // Operator sees all their brands
  async listBrands(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") {
        return res.status(403).json({ error: "Only operators can list brands" });
      }

      const brands = await Brand.find({ operatorId: operator.operatorId })
        .sort({ createdAt: -1 })
        .lean();

      res.json(brands);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // POST /affiliates  — operator creates a single affiliate
  async create(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") {
        return res.status(403).json({ error: "Only operators can create affiliates" });
      }
      const { user, affiliateCode, allCodes } = await createAffiliate(operator, req.body);
      return res.status(201).json({
        message: "Affiliate created. Share the activate link so they can set their password.",
        activateUrl: `/activate?userId=${user._id}`,
        affiliateCode,
        allCodes,
        user: { id: String(user._id), email: user.email, username: user.username, status: user.status },
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        error: err.message,
        // Lets the UI act on the specific precondition (e.g. deep-link to the
        // brand that's missing a URL) instead of parsing the message.
        ...(err.code ? { code: err.code } : {}),
        ...(err.brands ? { brands: err.brands } : {}),
      });
    }
  },

  // POST /affiliates/bulk  — operator creates multiple affiliates at once
  async bulkCreate(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") {
        return res.status(403).json({ error: "Only operators can create affiliates" });
      }

      const items = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Request body must be a non-empty array" });
      }
      if (items.length > 500) {
        return res.status(400).json({ error: "Max 500 affiliates per bulk request" });
      }

      const results = { created: [], failed: [] };

      for (const item of items) {
        try {
          const { user, affiliateCode, allCodes } = await createAffiliate(operator, item);
          results.created.push({
            email: user.email,
            username: user.username,
            affiliateCode,
            allCodes,
            activateUrl: `/activate?userId=${user._id}`,
          });
        } catch (err) {
          results.failed.push({ email: item.email, error: err.message });
        }
      }

      return res.status(207).json(results);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // POST /affiliates/brands
  async createBrand(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") {
        return res.status(403).json({ error: "Only operators can create brands" });
      }

      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "name is required" });

      // Brand.id is GLOBALLY unique — picking max + 1 per-operator would
      // eventually collide with another operator's brand. Sequence against
      // the whole collection instead.
      const last = await Brand.findOne({}).sort({ id: -1 }).select({ id: 1 }).lean();
      const nextId = (last?.id ?? 0) + 1;

      const brand = await Brand.create({ id: nextId, name, operatorId: operator.operatorId });
      await cloneOperatorDefaultsForBrand(operator.operatorId, brand._id);
      res.status(201).json(brand);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // PATCH /affiliates/:id/parent  — operator sets/clears parent affiliate + override rate
  async setParent(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") {
        return res.status(403).json({ error: "Only operators can set parent affiliates" });
      }

      const { parentAffiliateId, overrideRate } = req.body;

      if (overrideRate !== undefined && (overrideRate < 0 || overrideRate > 100)) {
        return res.status(400).json({ error: "overrideRate must be 0–100" });
      }

      if (parentAffiliateId) {
        const parentProfile = await AffiliateProfile.findOne({
          user: parentAffiliateId,
          operatorUser: operator._id,
        }).lean();
        if (!parentProfile) {
          return res.status(404).json({ error: "Parent affiliate not found in this operator" });
        }
        if (await wouldCreateCycle(req.params.id, parentAffiliateId)) {
          return res.status(400).json({ error: "Cannot set parent: would create a cycle in the hierarchy" });
        }
      }

      const update = {
        parentAffiliate: parentAffiliateId ?? null,
        ...(overrideRate !== undefined && { overrideRate }),
      };

      const profile = await AffiliateProfile.findOneAndUpdate(
        { user: req.params.id, operatorUser: operator._id },
        { $set: update },
        { new: true },
      );
      if (!profile) return res.status(404).json({ error: "Affiliate not found" });

      res.json({ ok: true, parentAffiliate: profile.parentAffiliate, overrideRate: profile.overrideRate });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // GET /affiliates/:id/sub-affiliates  — list direct sub-affiliates of this affiliate
  async listSubAffiliates(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") {
        return res.status(403).json({ error: "Only operators can view sub-affiliates" });
      }

      const subProfiles = await AffiliateProfile.find({
        parentAffiliate: req.params.id,
        operatorUser:    operator._id,
      }).lean();

      const userIds = subProfiles.map((p) => p.user);
      const users   = await User.find({ _id: { $in: userIds } })
        .select("-password -twoFactorSecret")
        .lean();

      const userMap = new Map(users.map((u) => [String(u._id), u]));

      const result = subProfiles.map((p) => ({
        ...userMap.get(String(p.user)),
        overrideRate:  p.overrideRate,
        referralCodes: p.referralCodes,
      }));

      res.json({ subAffiliates: result, total: result.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

module.exports = affiliateController;
