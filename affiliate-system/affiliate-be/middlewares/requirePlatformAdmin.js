"use strict";

/**
 * Gate Hexium-internal routes. Must be mounted AFTER the auth middleware that
 * populates req.affiliateUser. Returns 403 for everyone whose user document
 * doesn't carry `isPlatformAdmin: true`, regardless of role.
 */
module.exports = function requirePlatformAdmin(req, res, next) {
  const user = req.affiliateUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (!user.isPlatformAdmin) {
    return res.status(403).json({ error: "Platform admin only" });
  }
  next();
};
