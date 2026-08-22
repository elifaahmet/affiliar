"use strict";

// Auth for the documentation page.
//
// Separate from authorize() on purpose. That one reads the Authorization
// header, which a browser following a link cannot send — but accepting the
// session cookie everywhere would open every state-changing endpoint to CSRF,
// which is presumably why it was header-only to begin with.
//
// So the cookie is accepted here and nowhere else: this route is a read-only
// page, and the cookie is already set at login as httpOnly + secure +
// sameSite=strict.

const jwt = require("jsonwebtoken");
const { SECRET_KEY } = require("../utils/jwtSecret");
const User = require("../models/User");

module.exports = async function docsAccess(req, res, next) {
  const fromHeader = String(req.header("Authorization") || "").replace(/^Bearer\s+/i, "");
  const token = fromHeader || (req.cookies && req.cookies.token);

  if (!token) return res.redirect(302, "/?next=/docs");

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const user = await User.findById(decoded.sub).select({ _id: 1, role: 1, isDeleted: 1 }).lean();
    if (!user || user.isDeleted) return res.redirect(302, "/?next=/docs");
    req.docsUser = user;
    return next();
  } catch {
    // Expired or tampered — send them to sign in rather than showing an
    // error page for what is, from the reader's side, just a stale session.
    return res.redirect(302, "/?next=/docs");
  }
};
