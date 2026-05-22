"use strict";

/**
 * Sub-affiliate payout under the "share of parent's commission" model.
 *
 * The operator pays the affiliate chain a commission on the sub's subtree
 * activity — opRevshareCents + opCpaCents, i.e. the operator plan applied to
 * the SUB's own subtree. That money cascades downward: every parent → child
 * edge keeps the bulk and passes its configured share % to the child.
 *
 * Revshare and CPA are two independent buckets, each cascading
 * multiplicatively and independently:
 *
 *   subRevshare = opRevshare × ∏(edge.revshareRate%   for edges top → sub)
 *   subCpa      = opCpa      × ∏(edge.cpaSharePercent% for edges top → sub)
 *
 * Because every share is a percentage in [0, 100], a sub can never be paid
 * more than its parent earns on that subtree — so a parent can never go
 * negative by over-paying a sub. This is the whole point of the model: the
 * old design applied the sub's rate straight to NGR, decoupled from what the
 * parent actually earned.
 *
 * Pure function — no I/O. All cents are integers.
 *
 * @param {object} args
 * @param {number} args.opRevshareCents  operator-plan revshare on the sub's subtree
 * @param {number} args.opCpaCents       operator-plan CPA on the sub's subtree
 * @param {Array<{revshareRate:number, cpaSharePercent:number}>} args.ancestorEdges
 *        every sub-edge strictly ABOVE this sub (its parent's incoming edge,
 *        grandparent's, …, up to but not including the top-level affiliate,
 *        who has no incoming edge). Order does not matter. May be empty when
 *        the parent is itself the top-level affiliate.
 * @param {{revshareRate:number, cpaSharePercent:number}} args.ownEdge
 *        this sub's own incoming edge (its subPlan).
 * @returns {{
 *   revshareAmountCents:number, cpaAmountCents:number, payableCents:number,
 *   basisRevshareCents:number,  basisCpaCents:number
 * }}
 *   basis* = what the parent holds for this subtree — the amount the sub's
 *   own share % was applied to (handy for UI / audit: "10% of $200").
 */
function computeSubPayout({ opRevshareCents, opCpaCents, ancestorEdges, ownEdge }) {
  // Parent's holding starts at the full operator commission for the subtree
  // and shrinks through every edge above this sub.
  let basisRevshareCents = nonNegInt(opRevshareCents);
  let basisCpaCents = nonNegInt(opCpaCents);

  for (const edge of ancestorEdges || []) {
    basisRevshareCents = applyShare(basisRevshareCents, edge && edge.revshareRate);
    basisCpaCents = applyShare(basisCpaCents, edge && edge.cpaSharePercent);
  }

  const own = ownEdge || { revshareRate: 0, cpaSharePercent: 0 };
  const revshareAmountCents = applyShare(basisRevshareCents, own.revshareRate);
  const cpaAmountCents = applyShare(basisCpaCents, own.cpaSharePercent);

  return {
    revshareAmountCents,
    cpaAmountCents,
    payableCents: revshareAmountCents + cpaAmountCents,
    basisRevshareCents,
    basisCpaCents,
  };
}

// floor(amount × pct%), with pct clamped to [0, 100] and amount to ≥ 0.
function applyShare(amountCents, pct) {
  const base = nonNegInt(amountCents);
  const p = clampPct(pct);
  if (base === 0 || p === 0) return 0;
  return Math.floor((base * p) / 100);
}

function clampPct(v) {
  const n = Number(v) || 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function nonNegInt(v) {
  const n = Math.floor(Number(v) || 0);
  return n > 0 ? n : 0;
}

module.exports = { computeSubPayout };
