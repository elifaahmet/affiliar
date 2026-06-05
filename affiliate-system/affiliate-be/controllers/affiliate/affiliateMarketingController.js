"use strict";

const AffiliateProfile  = require("../../models/AffiliateProfile");
const Brand             = require("../../models/Brand");
const BrandPage         = require("../../models/BrandPage");
const AffiliateBuiltLink = require("../../models/AffiliateBuiltLink");

/**
 * Affiliate-portal "Marketing Tools": expose the operator's brand pages to the
 * affiliate as a selectable list, and let the affiliate save the tracking
 * links they build (page + campaign/sub/custom params) so they can re-copy
 * them later.
 *
 * Scope: every handler requires an affiliate, and only ever touches brands the
 * affiliate already has a referral code for (AffiliateProfile.brandCodes).
 */

function affiliateOnly(req, res) {
  const user = req.affiliateUser;
  if (!user || user.role !== "affiliate") {
    res.status(403).json({ error: "Affiliates only" });
    return null;
  }
  if (!user.operatorId) {
    res.status(400).json({ error: "Affiliate is not linked to an operator" });
    return null;
  }
  return user;
}

// brandId(string) → affiliate's referral code for that brand.
async function affiliateBrandCodeMap(userId) {
  const profile = await AffiliateProfile.findOne({ user: userId })
    .select("brandCodes")
    .lean();
  const map = new Map();
  for (const bc of profile?.brandCodes ?? []) {
    if (bc.brandId) map.set(String(bc.brandId), bc.code);
  }
  return map;
}

// Canonical tracking-URL builder. Appends ?affiliate=<code> + tracking params
// to a base URL, preserving any query string already on the base.
function buildTrackingUrl(base, code, { campaign, sub, customParams } = {}) {
  const trimmed = String(base || "").trim().replace(/\/+$/, "");
  const pairs = [["affiliate", code]];
  if (campaign && campaign.trim()) pairs.push(["campaign", campaign.trim()]);
  if (sub && sub.trim()) pairs.push(["sub", sub.trim()]);
  for (const p of customParams || []) {
    const k = String(p.key || "").trim();
    const v = String(p.value || "").trim();
    if (k && v && k.toLowerCase() !== "affiliate") pairs.push([k, v]);
  }
  const qs = pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const joiner = trimmed.includes("?") ? "&" : "/?";
  return `${trimmed}${joiner}${qs}`;
}

/**
 * GET /api/affiliate-portal/brand-pages
 * Enabled pages for every brand the affiliate has a code for, each annotated
 * with the affiliate's code for that brand so the FE can build links.
 */
exports.listBrandPages = async (req, res) => {
  const user = affiliateOnly(req, res);
  if (!user) return;

  try {
    const codeMap = await affiliateBrandCodeMap(user._id);
    const brandIds = [...codeMap.keys()];
    if (brandIds.length === 0) return res.json({ pages: [] });

    const [brands, pages] = await Promise.all([
      Brand.find({ _id: { $in: brandIds } }).select("_id name url").lean(),
      BrandPage.find({ brandId: { $in: brandIds }, enabled: true })
        .sort({ createdAt: 1 })
        .lean(),
    ]);
    const brandMap = new Map(brands.map((b) => [String(b._id), b]));

    const out = pages.map((p) => {
      const brand = brandMap.get(String(p.brandId));
      return {
        _id: String(p._id),
        brandId: String(p.brandId),
        brandName: brand?.name ?? null,
        brandUrl: brand?.url ?? null,
        code: codeMap.get(String(p.brandId)) ?? null,
        name: p.name,
        url: p.url || null,
        description: p.description || null,
      };
    });
    return res.json({ pages: out });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/affiliate-portal/links
 * The affiliate's saved tracking links, newest first.
 */
exports.listLinks = async (req, res) => {
  const user = affiliateOnly(req, res);
  if (!user) return;

  try {
    const links = await AffiliateBuiltLink.find({ affiliateUserId: user._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const brandIds = [...new Set(links.map((l) => String(l.brandId)))];
    const brands = brandIds.length
      ? await Brand.find({ _id: { $in: brandIds } }).select("_id name").lean()
      : [];
    const bmap = new Map(brands.map((b) => [String(b._id), b.name]));

    return res.json({
      links: links.map((l) => ({
        ...l,
        brandName: bmap.get(String(l.brandId)) ?? null,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/affiliate-portal/links
 * Body: { brandId, pageId?, campaign?, sub?, customParams?, label? }
 * The URL is rebuilt server-side from the affiliate's brand code + the chosen
 * page (or brand homepage) so it can't be forged from the client.
 */
exports.createLink = async (req, res) => {
  const user = affiliateOnly(req, res);
  if (!user) return;

  const { brandId, pageId, campaign, sub, customParams, label } = req.body || {};
  if (!brandId) return res.status(400).json({ error: "brandId is required" });

  try {
    const codeMap = await affiliateBrandCodeMap(user._id);
    const code = codeMap.get(String(brandId));
    if (!code) return res.status(403).json({ error: "no_code_for_brand" });

    const brand = await Brand.findById(brandId)
      .select("_id name url")
      .lean();
    if (!brand) return res.status(404).json({ error: "brand_not_found" });

    let page = null;
    let base = brand.url;
    if (pageId) {
      page = await BrandPage.findOne({ _id: pageId, brandId }).lean();
      if (!page) return res.status(404).json({ error: "page_not_found" });
      base = page.url || brand.url;
    }
    if (!base) return res.status(400).json({ error: "no_target_url" });

    const cleanCustom = Array.isArray(customParams)
      ? customParams
          .map((p) => ({
            key: String(p.key || "").trim(),
            value: String(p.value || "").trim(),
          }))
          .filter((p) => p.key && p.value && p.key.toLowerCase() !== "affiliate")
      : [];

    const url = buildTrackingUrl(base, code, { campaign, sub, customParams: cleanCustom });

    const link = await AffiliateBuiltLink.create({
      affiliateUserId: user._id,
      operatorId: user.operatorId,
      brandId,
      pageId: page ? page._id : null,
      code,
      label: (label && label.trim()) || (page ? page.name : brand.name) || null,
      targetUrl: base,
      url,
      campaign: (campaign && campaign.trim()) || null,
      sub: (sub && sub.trim()) || null,
      customParams: cleanCustom,
    });

    return res.status(201).json({ link });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE /api/affiliate-portal/links/:linkId
 */
exports.deleteLink = async (req, res) => {
  const user = affiliateOnly(req, res);
  if (!user) return;

  try {
    const deleted = await AffiliateBuiltLink.findOneAndDelete({
      _id: req.params.linkId,
      affiliateUserId: user._id,
    });
    if (!deleted) return res.status(404).json({ error: "link_not_found" });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
