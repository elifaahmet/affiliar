"use strict";

const AffiliateProfile = require("../models/AffiliateProfile");

/**
 * Walks parent links upward from a starting affiliate user id and returns
 * the chain as an array of user-id strings, root first. Excludes the start
 * itself. Caps at 100 hops to defend against accidental cycles in legacy
 * data — Phase 1 also rejects cycles at write time but reads should never
 * loop forever either way.
 */
async function getAncestorIds(userId) {
  const out = [];
  let cursor = userId;
  for (let i = 0; i < 100; i++) {
    const profile = await AffiliateProfile.findOne({ user: cursor })
      .select("parentAffiliate")
      .lean();
    if (!profile?.parentAffiliate) break;
    const parentId = String(profile.parentAffiliate);
    if (out.includes(parentId)) break; // cycle guard
    out.push(parentId);
    cursor = profile.parentAffiliate;
  }
  return out;
}

/**
 * Returns true if making `proposedParentId` the parent of `childId` would
 * close a cycle. A cycle exists if childId is already in proposedParent's
 * ancestor chain, or childId === proposedParentId.
 */
async function wouldCreateCycle(childId, proposedParentId) {
  if (String(childId) === String(proposedParentId)) return true;
  const ancestors = await getAncestorIds(proposedParentId);
  return ancestors.includes(String(childId));
}

/**
 * Returns all descendant user-id strings of the given affiliate, BFS.
 * Includes nothing if the affiliate has no children.
 */
async function getDescendantIds(rootUserId) {
  const out = [];
  let frontier = [rootUserId];
  for (let depth = 0; depth < 100 && frontier.length; depth++) {
    const children = await AffiliateProfile.find({
      parentAffiliate: { $in: frontier },
    })
      .select("user parentAffiliate")
      .lean();
    if (children.length === 0) break;
    frontier = children.map((c) => c.user);
    for (const c of children) out.push(String(c.user));
  }
  return out;
}

module.exports = { getAncestorIds, wouldCreateCycle, getDescendantIds };
