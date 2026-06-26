const Creative = require("../../models/Creative");
const Brand = require("../../models/Brand");
const AffiliateProfile = require("../../models/AffiliateProfile");

const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "creative";

// Join a brand homepage with an optional landing override (absolute URL wins,
// otherwise treat it as a path appended to the brand URL).
function landingFor(brandUrl, landingPath) {
  const base = (brandUrl || "").replace(/\/+$/, "");
  if (!landingPath) return base;
  if (/^https?:\/\//i.test(landingPath)) return landingPath;
  return `${base}/${String(landingPath).replace(/^\/+/, "")}`;
}

const creativeController = {
  // ── Operator ───────────────────────────────────────────────────────────────

  // GET /creatives?brandId=&status=
  async list(req, res) {
    try {
      const user = req.affiliateUser;
      const filter = { operatorId: user.operatorId };
      if (req.query.brandId) filter.brandId = req.query.brandId;
      if (req.query.status) filter.status = req.query.status;
      const creatives = await Creative.find(filter)
        .populate("brandId", "name")
        .sort({ createdAt: -1 })
        .lean();
      res.json({ creatives });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // POST /creatives
  async create(req, res) {
    try {
      const user = req.affiliateUser;
      const { brandId, name, type = "banner", imageUrl, width, height, landingPath, body } = req.body || {};
      if (!brandId || !name) return res.status(400).json({ error: "brandId and name are required" });

      const brand = await Brand.findOne({ _id: brandId, operatorId: user.operatorId }).select({ _id: 1 }).lean();
      if (!brand) return res.status(400).json({ error: "Unknown brand" });
      if (type === "banner" && !imageUrl) return res.status(400).json({ error: "Banner needs an image URL" });
      if (type === "text" && !body) return res.status(400).json({ error: "Text creative needs a body" });

      const creative = await Creative.create({
        operatorId: user.operatorId,
        brandId,
        name: String(name).trim(),
        type: type === "text" ? "text" : "banner",
        imageUrl: imageUrl || null,
        width: width ? Number(width) : null,
        height: height ? Number(height) : null,
        landingPath: landingPath ? String(landingPath).trim() : null,
        body: body || null,
        createdBy: user._id,
      });
      res.status(201).json({ creative });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // PATCH /creatives/:id
  async update(req, res) {
    try {
      const user = req.affiliateUser;
      const allowed = ["name", "imageUrl", "width", "height", "landingPath", "body", "status"];
      const set = {};
      for (const k of allowed) if (k in (req.body || {})) set[k] = req.body[k];
      if (set.status && !["active", "archived"].includes(set.status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const creative = await Creative.findOneAndUpdate(
        { _id: req.params.id, operatorId: user.operatorId },
        { $set: set },
        { new: true },
      ).populate("brandId", "name").lean();
      if (!creative) return res.status(404).json({ error: "Not found" });
      res.json({ creative });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // DELETE /creatives/:id
  async remove(req, res) {
    try {
      const user = req.affiliateUser;
      const r = await Creative.deleteOne({ _id: req.params.id, operatorId: user.operatorId });
      if (!r.deletedCount) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // ── Affiliate (mounted under /affiliate-portal/creatives) ────────────────────

  // GET /affiliate-portal/creatives — active creatives for brands the affiliate
  // has a tracking code for, each with the code + default campaign + landing so
  // the FE can assemble the smartlink + embed.
  async affiliateList(req, res) {
    try {
      const user = req.affiliateUser;
      if (user.role !== "affiliate") return res.status(403).json({ error: "Affiliates only" });

      const profile = await AffiliateProfile.findOne({ user: user._id }).select({ brandCodes: 1 }).lean();
      const codeByBrand = new Map((profile?.brandCodes || []).map((bc) => [String(bc.brandId), bc.code]));
      if (codeByBrand.size === 0) return res.json({ creatives: [] });

      const brandIds = [...codeByBrand.keys()];
      const [creatives, brands] = await Promise.all([
        Creative.find({ operatorId: user.operatorId, status: "active", brandId: { $in: brandIds } })
          .sort({ createdAt: -1 })
          .lean(),
        Brand.find({ _id: { $in: brandIds } }).select({ name: 1, url: 1 }).lean(),
      ]);
      const brandById = new Map(brands.map((b) => [String(b._id), b]));

      const out = creatives.map((c) => {
        const brand = brandById.get(String(c.brandId));
        return {
          _id: c._id,
          name: c.name,
          type: c.type,
          imageUrl: c.imageUrl,
          width: c.width,
          height: c.height,
          body: c.body,
          brandId: c.brandId,
          brandName: brand?.name || null,
          code: codeByBrand.get(String(c.brandId)),
          campaign: `creative-${slug(c.name)}`,
          landing: landingFor(brand?.url, c.landingPath),
        };
      });
      res.json({ creatives: out });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

module.exports = creativeController;
