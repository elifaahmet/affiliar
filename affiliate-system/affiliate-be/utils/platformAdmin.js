"use strict";

/**
 * Single source of truth for who counts as a platform admin.
 *
 * The `User.isPlatformAdmin` boolean is necessary but NOT sufficient: even
 * with the flag flipped on a user document, only the emails listed here can
 * pass `isPlatformAdminUser()`. This way an accidental (or malicious) DB
 * update that sets the flag on a different account can't unlock /admin
 * routes — the email allowlist is the hard gate.
 *
 * Override at deploy time via the comma-separated PLATFORM_ADMIN_EMAILS env
 * (e.g. for a staging environment with a different admin). Empty / unset
 * falls back to the hardcoded default below.
 */

const DEFAULT_PLATFORM_ADMIN_EMAILS = ["elifaahmet@gmail.com"];

function parseEnvList() {
  const raw = String(process.env.PLATFORM_ADMIN_EMAILS || "").trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function getAllowedEmails() {
  return parseEnvList() || DEFAULT_PLATFORM_ADMIN_EMAILS;
}

function isPlatformAdminUser(user) {
  if (!user || !user.isPlatformAdmin) return false;
  const email = String(user.email || "").trim().toLowerCase();
  if (!email) return false;
  return getAllowedEmails().includes(email);
}

module.exports = { isPlatformAdminUser, getAllowedEmails };
