const Brand = require("../../models/Brand");
const { cloneOperatorDefaultsForBrand } = require("../../utils/brandDefaults");

/**
 * GET /api/brands
 * Returns all brands belonging to the authenticated operator.
 */
exports.list = async (req, res) => {
  const operator = req.affiliateUser;
  if (operator.role !== "operator") {
    return res.status(403).json({ error: "Only operators can access brands" });
  }

  try {
    const brands = await Brand.find({ operatorId: operator.operatorId })
      .select("id name url enabled")
      .sort({ id: 1 })
      .lean();

    return res.json({ brands });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/brands
 * Create a new brand for the authenticated operator.
 * Body: { name, url?, enabled? }
 */
exports.create = async (req, res) => {
  const operator = req.affiliateUser;
  if (operator.role !== "operator") {
    return res.status(403).json({ error: "Only operators can manage brands" });
  }

  const { name, url, enabled } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  try {
    // Brand.id is globally unique — sequence against the whole collection.
    const last = await Brand.findOne({}).sort({ id: -1 }).select({ id: 1 }).lean();
    const nextId = (last?.id ?? 0) + 1;

    const brand = await Brand.create({
      id: nextId,
      name: name.trim(),
      url: url?.trim() || null,
      enabled: enabled !== undefined ? Boolean(enabled) : true,
      operatorId: operator.operatorId,
    });

    // Seed the new brand with the operator-default financial settings +
    // provider fee rates so the fees admin shows real values from day one
    // (and an "untouched" Save can't wipe them with zeros).
    await cloneOperatorDefaultsForBrand(operator.operatorId, brand._id);

    return res.status(201).json({ brand });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * PATCH /api/brands/:id
 * Update a brand (name, url, enabled).
 */
exports.update = async (req, res) => {
  const operator = req.affiliateUser;
  if (operator.role !== "operator") {
    return res.status(403).json({ error: "Only operators can manage brands" });
  }

  const { name, url, enabled } = req.body;
  const updates = {};
  if (name !== undefined)    updates.name    = name.trim();
  if (url !== undefined)     updates.url     = url.trim() || null;
  if (enabled !== undefined) updates.enabled = Boolean(enabled);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  try {
    const brand = await Brand.findOneAndUpdate(
      { _id: req.params.id, operatorId: operator.operatorId },
      updates,
      { new: true }
    ).select("id name url enabled");

    if (!brand) return res.status(404).json({ error: "Brand not found" });

    return res.json({ brand });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
