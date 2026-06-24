"use strict";

const crypto = require("crypto");
const AffiliateProfile = require("../../models/AffiliateProfile");
const Brand = require("../../models/Brand");
const User = require("../../models/User");
const Click = require("../../models/Click");
const { logger } = require("../../middlewares/logger");

const FALLBACK_URL = process.env.CLICK_FALLBACK_URL || null;

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  return req.ip || null;
}

// Link-preview bots, crawlers, scanners and CLI fetchers. We still redirect
// them (could be a real user with an odd UA) but flag the click so it's
// excluded from funnel/conversion-rate counts.
const BOT_UA_RE = /(bot|crawl|spider|slurp|crawler|preview|fetch|monitor|scan|facebookexternalhit|whatsapp|telegram|discord|skype|slack|bingpreview|headless|phantom|curl|wget|python-requests|axios|go-http|okhttp|java\/)/i;

function isBotRequest(req) {
  const ua = req.headers["user-agent"];
  if (!ua || !ua.trim()) return true; // no UA → almost always a bot/scanner
  return BOT_UA_RE.test(ua);
}

// Cloudflare two-letter country (or null). 'XX'/'T1' are CF's unknown/Tor
// placeholders — treat as null.
function cfCountry(req) {
  const c = req.headers["cf-ipcountry"];
  if (typeof c !== "string" || !c.trim()) return null;
  const up = c.trim().toUpperCase();
  return up === "XX" || up === "T1" ? null : up;
}

// Append attribution params without clobbering ones the destination already
// has. Returns the final absolute URL string, or null if `dest` isn't a valid
// http(s) URL.
function buildDestination(dest, { code, clickId, sub, campaign }) {
  let u;
  try {
    u = new URL(dest);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.searchParams.set("affiliate", code);
  u.searchParams.set("click_id", clickId);
  if (sub) u.searchParams.set("sub", sub);
  if (campaign) u.searchParams.set("campaign", campaign);
  return u.toString();
}

// GET /r/:code — public click tracker. Resolves the affiliate code to its
// brand's landing URL, records the click, then 302-redirects the visitor on
// with attribution params. Query: ?sub=&campaign=&to=<landing override>.
exports.redirect = async (req, res) => {
  const code = String(req.params.code || "").trim().toUpperCase();
  const sub = req.query.sub ? String(req.query.sub).trim() : null;
  const campaign = req.query.campaign ? String(req.query.campaign).trim() : null;

  try {
    if (!code) return res.status(404).send("Invalid link");

    // Resolve code → affiliate + brand. Prefer the per-brand code (gives us a
    // brand + its landing URL); fall back to a legacy flat referral code.
    const profile = await AffiliateProfile.findOne({
      $or: [{ "brandCodes.code": code }, { referralCodes: code }],
    })
      .select({ user: 1, brandCodes: 1 })
      .lean();
    if (!profile) {
      if (FALLBACK_URL) return res.redirect(302, FALLBACK_URL);
      return res.status(404).send("Unknown tracking code");
    }

    const brandCode = (profile.brandCodes || []).find((bc) => bc.code === code);
    let brand = null;
    if (brandCode?.brandId) {
      brand = await Brand.findById(brandCode.brandId).select({ url: 1, operatorId: 1 }).lean();
    }
    // Legacy/no-brand-code: fall back to the affiliate's operator's first
    // enabled brand that has a URL.
    let operatorId = brand?.operatorId || null;
    if (!brand) {
      const affUser = await User.findById(profile.user).select({ operatorId: 1 }).lean();
      operatorId = affUser?.operatorId || null;
      if (operatorId) {
        brand = await Brand.findOne({ operatorId, enabled: true, url: { $nin: [null, ""] } })
          .select({ url: 1, operatorId: 1 })
          .lean();
      }
    }

    // Pick the landing URL: an explicit ?to= is honoured only when it points
    // at the brand's own host (no open-redirect), else the brand's URL.
    let landing = brand?.url || FALLBACK_URL;
    if (req.query.to && brand?.url) {
      try {
        const toHost = new URL(String(req.query.to)).host;
        const brandHost = new URL(brand.url).host;
        if (toHost === brandHost) landing = String(req.query.to);
      } catch { /* ignore malformed ?to= */ }
    }
    if (!landing) return res.status(404).send("No destination configured for this link");

    const clickId = `clk_${crypto.randomBytes(12).toString("hex")}`;
    const destination = buildDestination(landing, { code, clickId, sub, campaign });
    if (!destination) return res.status(404).send("Invalid destination");

    // Record the click (best-effort — never block the redirect on a write).
    try {
      await Click.create({
        clickId,
        operatorId,
        affiliateId: profile.user,
        affiliateCode: code,
        brandId: brandCode?.brandId || null,
        campaign,
        sub,
        ip: clientIp(req),
        userAgent: req.headers["user-agent"] || null,
        country: cfCountry(req),
        isBot: isBotRequest(req),
        targetUrl: destination,
      });
    } catch (err) {
      logger.error("click.record_failed", { code, error: err?.message });
    }

    return res.redirect(302, destination);
  } catch (err) {
    logger.error("click.redirect_failed", { code, error: err?.message });
    if (FALLBACK_URL) return res.redirect(302, FALLBACK_URL);
    return res.status(500).send("Tracking error");
  }
};
