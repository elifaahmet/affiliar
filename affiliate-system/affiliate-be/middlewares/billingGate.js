"use strict";

// Hard panel cut-off for operators whose billing is `suspended`. Mounted
// globally after authorize(); only blocks the operator-role user, and only
// on routes that aren't part of the pay-to-restore loop.
//
// Allowed-through prefixes (the operator still needs to log in, pay, and
// see their billing history while suspended):
//   /auth/*     — login, logout, 2fa, etc.
//   /billing/*  — status, wallets, pay, sans callback
//   /admin/*    — platform admin acts on suspended operators
//
// Affiliates of a suspended operator are not blocked — they didn't fail to
// pay and their own panel keeps working. The job's `billingExpiryJob` is
// what flips the operator into `suspended`; this middleware just enforces
// it on incoming requests.

const Operator = require("../models/Operator");

const allowedPrefixes = ["/auth/", "/billing/", "/admin/"];

function isAllowedPath(reqPath, prefix) {
  // Match either the exact prefix root or anything beneath it. `reqPath`
  // comes from express and already has the API prefix stripped where
  // applicable, so we test both with and without a leading "/api".
  const tail = reqPath.startsWith("/api") ? reqPath.slice(4) : reqPath;
  return allowedPrefixes.some(
    (p) => tail === p.slice(0, -1) || tail.startsWith(p),
  );
}

async function blockSuspendedOperator(req, res, next) {
  try {
    const user = req.affiliateUser;
    // No user (public route somehow reached this point) or not an operator
    // role — let it through.
    if (!user || user.role !== "operator" || !user.operatorId) return next();

    if (isAllowedPath(req.path)) return next();

    const operator = await Operator.findById(user.operatorId)
      .select({ billingStatus: 1 })
      .lean();
    if (!operator || operator.billingStatus !== "suspended") return next();

    return res.status(402).json({
      error:
        "Operator panel suspended for non-payment. Pay the outstanding invoice to restore access.",
      suspended: true,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { blockSuspendedOperator };
