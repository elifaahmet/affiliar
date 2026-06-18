"use strict";

// Gate for operator-wide / owner-only sections (payouts, commission, fees,
// brands, team management). Blocks brand-scoped operator users — those whose
// `User.brandIds` is non-empty — with HTTP 403. Full-access operator owners
// (no brandIds) and affiliates pass straight through, so existing behaviour
// is unchanged. Mount AFTER the auth middleware that sets req.affiliateUser.
module.exports = function requireOperatorOwner(req, res, next) {
  const user = req.affiliateUser;
  if (
    user &&
    user.role === "operator" &&
    Array.isArray(user.brandIds) &&
    user.brandIds.length > 0
  ) {
    return res.status(403).json({
      error: "owner_only",
      message: "Brand-scoped users cannot access this section",
    });
  }
  return next();
};
