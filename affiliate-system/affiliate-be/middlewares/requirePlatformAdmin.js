"use strict";

const { isPlatformAdminUser } = require("../utils/platformAdmin");

/**
 * Gate Hexium-internal routes. Must be mounted AFTER the auth middleware
 * that populates req.affiliateUser. Returns 403 unless the user carries
 * `isPlatformAdmin: true` AND their email is on the platform-admin
 * allowlist (utils/platformAdmin.js). The two-factor check keeps a
 * DB-flipped flag on a wrong account from leaking access.
 */
module.exports = function requirePlatformAdmin(req, res, next) {
  const user = req.affiliateUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (!isPlatformAdminUser(user)) {
    return res.status(403).json({ error: "Platform admin only" });
  }
  next();
};
