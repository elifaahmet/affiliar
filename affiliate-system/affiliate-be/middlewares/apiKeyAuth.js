"use strict";

const AffiliateProfile = require("../models/AffiliateProfile");
const User = require("../models/User");

/**
 * Authentication for the affiliate read-only pull API (/api/affiliate-api/v1).
 *
 * Affiliates integrate their own systems with a per-affiliate API key instead
 * of the session JWT. The key arrives as `Authorization: Bearer <key>` or
 * `X-Api-Key: <key>`. On success this populates `req.affiliateUser` with the
 * affiliate's User doc — exactly the shape the portal controllers already
 * expect — so the same read handlers can be reused unchanged.
 *
 * Must be mounted BEFORE the global JWT `authorize()` gate so API-key requests
 * never hit the session-cookie path.
 */
module.exports = async function apiKeyAuth(req, res, next) {
  try {
    const header = req.header("Authorization") || "";
    const key = header.startsWith("Bearer ")
      ? header.slice("Bearer ".length).trim()
      : (req.header("X-Api-Key") || "").trim();

    if (!key) {
      return res.status(401).json({ error: "API key required" });
    }

    const profile = await AffiliateProfile.findOne({ apiKey: key })
      .select("user")
      .lean();
    if (!profile) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const user = await User.findById(profile.user);
    if (!user || user.isDeleted || user.role !== "affiliate") {
      return res.status(401).json({ error: "Invalid API key" });
    }

    req.affiliateUser = user;
    req.roleName = user.role;
    req.apiKeyAuth = true;
    return next();
  } catch (err) {
    return res.status(500).json({ error: "auth_error" });
  }
};
