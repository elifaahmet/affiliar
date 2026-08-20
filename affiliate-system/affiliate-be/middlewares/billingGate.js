"use strict";

// Panel cut-off for tenants whose billing is `suspended`. Mounted globally
// after authorize().
//
// Operators are blocked because they failed to pay. Their affiliates are
// blocked too — the operator stopped paying for the service, so the service
// stops — but the two cut-offs are deliberately not the same shape.
//
// Allowed-through prefixes for the OPERATOR (they still need to log in, pay,
// and see their billing history while suspended):
//   /auth/*     — login, logout, 2fa, etc.
//   /billing/*  — status, wallets, pay, provider callback
//   /admin/*    — platform admin acts on suspended operators
//
// Allowed-through for the AFFILIATE: /auth/* plus the money they are owed.
// An affiliate did not fail to pay — withholding the record of commission
// already earned would make them chase us instead of their operator, and
// that money is theirs whether or not the operator settles up. So balance,
// payout history and the payout wallet stay readable and writable; reports,
// links, creatives and everything else that is "using the product" do not.
//
// `billingExpiryJob` is what flips an operator into `suspended`; this
// middleware only enforces it on incoming requests.

const Operator = require("../models/Operator");

const OPERATOR_ALLOWED = ["/auth/", "/billing/", "/admin/"];

const AFFILIATE_ALLOWED = [
  "/auth/",
  // Why the operator's panel went dark, so the UI can say so rather than
  // failing with a bare 402 the affiliate can't interpret.
  "/affiliate-portal/account-status",
  // The money. Read and write — they must be able to correct a wrong payout
  // address even while the operator is behind on their invoice.
  "/affiliate-portal/payout-balance",
  "/affiliate-portal/payout-info",
  "/affiliate-portal/payouts",
];

function isAllowedPath(reqPath, prefixes) {
  // `reqPath` comes from express and already has the API prefix stripped
  // where applicable, so test both with and without a leading "/api".
  const tail = reqPath.startsWith("/api") ? reqPath.slice(4) : reqPath;
  return prefixes.some((p) => {
    // Trailing-slash entries match the whole subtree; bare paths match the
    // route itself and anything nested under it.
    const root = p.endsWith("/") ? p.slice(0, -1) : p;
    return tail === root || tail.startsWith(root + "/");
  });
}

async function blockSuspendedOperator(req, res, next) {
  try {
    const user = req.affiliateUser;
    if (!user || !user.operatorId) return next();

    const role = user.role;
    if (role !== "operator" && role !== "affiliate") return next();

    const prefixes = role === "operator" ? OPERATOR_ALLOWED : AFFILIATE_ALLOWED;
    if (isAllowedPath(req.path, prefixes)) return next();

    const operator = await Operator.findById(user.operatorId)
      .select({ billingStatus: 1, lifetimeFree: 1, name: 1 })
      .lean();
    if (!operator) return next();
    // Lifetime-free tenants are never blocked, regardless of status.
    if (operator.lifetimeFree) return next();
    if (operator.billingStatus !== "suspended") return next();

    if (role === "operator") {
      return res.status(402).json({
        error:
          "Operator panel suspended for non-payment. Pay the outstanding invoice to restore access.",
        suspended: true,
        reason: "operator_unpaid",
      });
    }

    return res.status(402).json({
      error:
        "This panel is suspended because your operator's subscription is unpaid. " +
        "Your balance and payout history stay available.",
      suspended: true,
      reason: "operator_unpaid",
      operatorName: operator.name || null,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { blockSuspendedOperator };
