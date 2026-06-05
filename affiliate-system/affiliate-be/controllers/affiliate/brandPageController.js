const Brand = require("../../models/Brand");
const BrandPage = require("../../models/BrandPage");

/**
 * CRUD for operator-defined brand pages (BrandPage). Every handler is
 * operator-scoped: the caller must be an operator, and the target brand must
 * belong to that operator before any page read/write is allowed. Mirrors the
 * scope-enforcement pattern in referAFriendController.
 */

function operatorOnly(req, res) {
  const user = req.affiliateUser;
  if (!user || user.role !== "operator") {
    res.status(403).json({ error: "Operator authentication required" });
    return null;
  }
  if (!user.operatorId) {
    res.status(403).json({ error: "No operator linked to account" });
    return null;
  }
  return String(user.operatorId);
}

// Confirm the brand exists and is owned by this operator. Writes the error
// response itself and returns false on failure so callers can early-return.
async function assertBrandOwned(brandId, operatorId, res) {
  const brand = await Brand.findById(brandId).lean();
  if (!brand) {
    res.status(404).json({ error: "brand_not_found" });
    return false;
  }
  if (String(brand.operatorId) !== String(operatorId)) {
    res.status(403).json({ error: "brand_not_owned_by_operator" });
    return false;
  }
  return true;
}

/**
 * GET /api/brands/:brandId/pages
 * List a brand's pages, oldest first.
 */
exports.list = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId } = req.params;
  if (!(await assertBrandOwned(brandId, operatorId, res))) return;

  try {
    const pages = await BrandPage.find({ brandId, operatorId })
      .sort({ createdAt: 1 })
      .lean();
    return res.json({ pages });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/brands/:brandId/pages
 * Body: { name, url?, description?, enabled? }
 */
exports.create = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId } = req.params;
  if (!(await assertBrandOwned(brandId, operatorId, res))) return;

  const { name, url, description, enabled } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  try {
    const page = await BrandPage.create({
      brandId,
      operatorId,
      name: name.trim(),
      url: url?.trim() || null,
      description: description?.trim() || null,
      enabled: enabled !== undefined ? Boolean(enabled) : true,
    });
    return res.status(201).json({ page });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * PATCH /api/brands/:brandId/pages/:pageId
 * Partial update of name / url / description / enabled.
 */
exports.update = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId, pageId } = req.params;
  if (!(await assertBrandOwned(brandId, operatorId, res))) return;

  const { name, url, description, enabled } = req.body || {};
  const updates = {};
  if (name !== undefined) {
    if (!name.trim()) {
      return res.status(400).json({ error: "name cannot be empty" });
    }
    updates.name = name.trim();
  }
  if (url !== undefined) updates.url = url.trim() || null;
  if (description !== undefined) updates.description = description.trim() || null;
  if (enabled !== undefined) updates.enabled = Boolean(enabled);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  try {
    const page = await BrandPage.findOneAndUpdate(
      { _id: pageId, brandId, operatorId },
      updates,
      { new: true },
    );
    if (!page) return res.status(404).json({ error: "page_not_found" });
    return res.json({ page });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE /api/brands/:brandId/pages/:pageId
 */
exports.remove = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId, pageId } = req.params;
  if (!(await assertBrandOwned(brandId, operatorId, res))) return;

  try {
    const deleted = await BrandPage.findOneAndDelete({
      _id: pageId,
      brandId,
      operatorId,
    });
    if (!deleted) return res.status(404).json({ error: "page_not_found" });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
