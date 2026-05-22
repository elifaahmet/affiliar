"use strict";

const { computeSubPayout } = require("../engine/subAffiliatePayout");

// Edge helper — a sub-edge is just its two share percentages.
const edge = (revshareRate = 0, cpaSharePercent = 0) => ({
  revshareRate,
  cpaSharePercent,
});

describe("computeSubPayout — share-of-parent-commission model", () => {
  test("one level: sub gets its share of the operator commission", () => {
    // Operator pays the parent (top-level) $200 revshare on the sub's
    // subtree. Sub edge = 10% → sub gets $20, parent keeps $180.
    const out = computeSubPayout({
      opRevshareCents: 20000,
      opCpaCents: 0,
      ancestorEdges: [],
      ownEdge: edge(10, 0),
    });
    expect(out.revshareAmountCents).toBe(2000);
    expect(out.cpaAmountCents).toBe(0);
    expect(out.payableCents).toBe(2000);
    expect(out.basisRevshareCents).toBe(20000); // parent held the full $200
  });

  test("sub can never exceed the parent's earnings, even at 100%", () => {
    const out = computeSubPayout({
      opRevshareCents: 20000,
      opCpaCents: 0,
      ancestorEdges: [],
      ownEdge: edge(100, 0),
    });
    // At 100% the sub takes everything but not a cent more — parent nets 0,
    // never negative. That's the guarantee the old NGR-rate model lacked.
    expect(out.revshareAmountCents).toBe(20000);
  });

  test("two levels: shares cascade multiplicatively", () => {
    // Operator → top T: $200 on the subtree.
    // T → mid M edge: 50%  → M holds $100.
    // M → sub S edge: 10%  → S gets $10.
    const out = computeSubPayout({
      opRevshareCents: 20000,
      opCpaCents: 0,
      ancestorEdges: [edge(50, 0)], // M's incoming edge, above S
      ownEdge: edge(10, 0),         // S's own edge
    });
    expect(out.basisRevshareCents).toBe(10000); // M's holding
    expect(out.revshareAmountCents).toBe(1000); // 10% of $100
  });

  test("ancestor-edge order does not change the result", () => {
    const a = computeSubPayout({
      opRevshareCents: 100000,
      opCpaCents: 0,
      ancestorEdges: [edge(50, 0), edge(40, 0)],
      ownEdge: edge(10, 0),
    });
    const b = computeSubPayout({
      opRevshareCents: 100000,
      opCpaCents: 0,
      ancestorEdges: [edge(40, 0), edge(50, 0)],
      ownEdge: edge(10, 0),
    });
    expect(a.revshareAmountCents).toBe(b.revshareAmountCents);
  });

  test("revshare and CPA cascade as independent buckets", () => {
    const out = computeSubPayout({
      opRevshareCents: 20000,
      opCpaCents: 5000,
      ancestorEdges: [edge(50, 20)], // 50% rev, 20% cpa above the sub
      ownEdge: edge(10, 25),
    });
    // rev: 20000 → ×50% = 10000 → ×10% = 1000
    expect(out.revshareAmountCents).toBe(1000);
    // cpa: 5000 → ×20% = 1000 → ×25% = 250
    expect(out.cpaAmountCents).toBe(250);
    expect(out.payableCents).toBe(1250);
  });

  test("a revshare-only edge in the chain blocks CPA from flowing past it", () => {
    // Mid edge has cpaSharePercent 0 → CPA bucket dies there.
    const out = computeSubPayout({
      opRevshareCents: 20000,
      opCpaCents: 5000,
      ancestorEdges: [edge(50, 0)],
      ownEdge: edge(10, 100),
    });
    expect(out.revshareAmountCents).toBe(1000);
    expect(out.cpaAmountCents).toBe(0);
  });

  test("zero operator commission → zero payout", () => {
    const out = computeSubPayout({
      opRevshareCents: 0,
      opCpaCents: 0,
      ancestorEdges: [edge(50, 50)],
      ownEdge: edge(10, 10),
    });
    expect(out.payableCents).toBe(0);
  });

  test("negative operator inputs are clamped to zero", () => {
    const out = computeSubPayout({
      opRevshareCents: -5000,
      opCpaCents: -100,
      ancestorEdges: [],
      ownEdge: edge(50, 50),
    });
    expect(out.payableCents).toBe(0);
  });

  test("out-of-range share percentages are clamped to [0, 100]", () => {
    const out = computeSubPayout({
      opRevshareCents: 10000,
      opCpaCents: 0,
      ancestorEdges: [],
      ownEdge: edge(150, 0), // >100 clamps to 100
    });
    expect(out.revshareAmountCents).toBe(10000);
  });

  test("result is integer cents (floored)", () => {
    const out = computeSubPayout({
      opRevshareCents: 333,
      opCpaCents: 0,
      ancestorEdges: [],
      ownEdge: edge(33, 0), // 333 × 33% = 109.89 → 109
    });
    expect(out.revshareAmountCents).toBe(109);
    expect(Number.isInteger(out.revshareAmountCents)).toBe(true);
  });
});
