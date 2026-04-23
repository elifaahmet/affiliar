const { v4: uuidv4 } = require("uuid");
const ActivityHourly = require("../models/ActivityHourly");
const AffiliateProfile = require("../models/AffiliateProfile");
const { computeDerivedMetrics, checkMismatch } = require("../utils/deriveMetrics");
const { logger } = require("../middlewares/logger");

/**
 * Validate period rules:
 * - from < to
 * - granularity=hour: on the hour, exactly 1h
 * - granularity=day: midnight UTC, exactly 24h
 */
function validatePeriod(from, to, granularity) {
  const errors = [];
  const f = new Date(from);
  const t = new Date(to);

  if (f >= t) {
    errors.push(`'from' must be before 'to'`);
  }

  if (granularity === "hour") {
    if (f.getUTCMinutes() !== 0 || f.getUTCSeconds() !== 0) {
      errors.push(`'from' must be on the hour for granularity=hour`);
    }
    if (t.getUTCMinutes() !== 0 || t.getUTCSeconds() !== 0) {
      errors.push(`'to' must be on the hour for granularity=hour`);
    }
    if (t - f !== 60 * 60 * 1000) {
      errors.push(`Duration must be exactly 1 hour for granularity=hour`);
    }
  }

  if (granularity === "day") {
    if (f.getUTCHours() !== 0 || f.getUTCMinutes() !== 0 || f.getUTCSeconds() !== 0) {
      errors.push(`'from' must be midnight UTC for granularity=day`);
    }
    if (t - f !== 24 * 60 * 60 * 1000) {
      errors.push(`Duration must be exactly 24 hours for granularity=day`);
    }
  }

  return errors;
}

/**
 * POST /integration/activity
 *
 * Operator submits aggregated casino activity for a period.
 * Each player entry is inserted into activityHourly.
 * Duplicate business keys (same player/period/currency) are skipped.
 *
 * Body:
 * {
 *   from: string (ISO UTC),
 *   to: string (ISO UTC),
 *   granularity: "hour" | "day",
 *   players: [{
 *     playerId: string,
 *     currency: string,
 *     country?: string,
 *     affiliateId?: string,
 *     affiliateCode?: string,
 *     campaign?: string,
 *     subId?: string,
 *     playerStatuses?: { isDuplicate, isDisabled, isSelfExcluded, isVerified },
 *     metrics: { ... all cent fields ... }
 *   }]
 * }
 */
exports.importActivity = async (req, res) => {
  const operator = req.affiliateUser;

  if (operator.role !== "operator") {
    return res.status(403).json({ error: "Only operators can import activity data" });
  }

  if (!operator.operatorId) {
    return res.status(400).json({ error: "Operator account is not linked to an operator record" });
  }

  const { from, to, granularity = "hour", players } = req.body;

  // Validate required fields
  if (!from || !to) {
    return res.status(400).json({ error: "'from' and 'to' are required" });
  }
  if (!Array.isArray(players) || players.length === 0) {
    return res.status(400).json({ error: "'players' must be a non-empty array" });
  }

  // Validate period
  const periodErrors = validatePeriod(from, to, granularity);
  if (periodErrors.length > 0) {
    return res.status(400).json({ error: "Period validation failed", details: periodErrors });
  }

  const tenantId  = operator.operatorId.toString();
  const brandId   = req.body.brandId || "default";
  const sourceId  = uuidv4();
  const fromDate  = new Date(from);
  const toDate    = new Date(to);

  const results = { inserted: 0, skipped: 0, failed: [] };

  for (const p of players) {
    const { playerId, currency } = p;

    if (!playerId || !currency) {
      results.failed.push({ playerId, currency, reason: "playerId and currency are required" });
      continue;
    }

    // Validate metrics — all required fields must be non-negative integers
    const m = p.metrics || {};
    const requiredMetricFields = [
      "betsSumCents", "winsSumCents",
      "casinoBetsRollbacksSumCents", "casinoWinsRollbacksSumCents",
      "depositsCount", "depositsSumCents",
      "cashoutsCount", "cashoutsSumCents",
      "bonusIssuesSumCents", "additionalDeductionsSumCents",
      "paymentSystemFeesSumCents", "jackpotFeesSumCents",
      "gameProviderFeesSumCents", "casinoTaxesSumCents",
      "roundsCount",
      "registrations", "ftdCount", "ftdSumCents",
      "chargebacksCount", "chargebacksSumCents",
    ];

    // wagerCents is optional — if the casino platform doesn't track a separate
    // wagering figure (e.g. no bonus-wagering-contribution weighting), we fall
    // back to betsSumCents so reports still get a meaningful wager number.
    if (m.wagerCents === undefined || m.wagerCents === null) {
      m.wagerCents = m.betsSumCents;
    }

    const metricErrors = requiredMetricFields.filter(
      (f) => m[f] === undefined || typeof m[f] !== "number" || m[f] < 0
    );
    if (metricErrors.length > 0) {
      results.failed.push({
        playerId,
        currency,
        reason: `Invalid or missing metric fields: ${metricErrors.join(", ")}`,
      });
      continue;
    }

    if (m.ftdCount > m.depositsCount || m.ftdSumCents > m.depositsSumCents) {
      results.failed.push({ playerId, currency, reason: "ftd values cannot exceed deposit values" });
      continue;
    }

    // Compute server-side GGR/NGR and check for mismatch
    const computed = computeDerivedMetrics(m);
    const { ggrMismatch, ngrMismatch } = checkMismatch(m, computed);

    if (ggrMismatch) {
      logger.warn("integration.activity.ggr_mismatch", {
        tenantId, playerId, currency,
        producerGgr: m.casinoGgrCents,
        computedGgr: computed.computedGgrCents,
      });
    }
    if (ngrMismatch) {
      logger.warn("integration.activity.ngr_mismatch", {
        tenantId, playerId, currency,
        producerNgr: m.casinoNgrCents,
        computedNgr: computed.computedNgrCents,
      });
    }

    try {
      await ActivityHourly.create({
        tenantId,
        brandId,
        operatorId: operator.operatorId.toString(),
        from: fromDate,
        to: toDate,
        granularity,
        playerId,
        currency,
        country:       p.country || "",
        affiliateId:   p.affiliateId || "",
        affiliateCode: p.affiliateCode || "",
        campaign:      p.campaign || "",
        subId:         p.subId || "",
        metrics: {
          ...m,
          computedGgrCents: computed.computedGgrCents,
          computedNgrCents: computed.computedNgrCents,
          ggrMismatch,
          ngrMismatch,
        },
        playerStatuses: {
          isDuplicate:    p.playerStatuses?.isDuplicate    ?? false,
          isDisabled:     p.playerStatuses?.isDisabled     ?? false,
          isSelfExcluded: p.playerStatuses?.isSelfExcluded ?? false,
          isVerified:     p.playerStatuses?.isVerified     ?? false,
        },
        sourceEventId:    sourceId,
        sourceSystem:     "activity-import-api",
        sourceProducedAt: new Date(),
      });

      results.inserted++;
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate business key — already have this player/period/currency
        results.skipped++;
      } else {
        logger.error("integration.activity.insert_error", { tenantId, playerId, currency, error: err.message });
        results.failed.push({ playerId, currency, reason: err.message });
      }
    }
  }

  logger.info("integration.activity.import_complete", {
    tenantId,
    from,
    to,
    total: players.length,
    ...results,
  });

  return res.status(200).json({
    success: true,
    period: { from, to, granularity },
    results,
  });
};
