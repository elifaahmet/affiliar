const express = require("express");
const router = express.Router();
const { importActivity } = require("../controllers/integrationController");
const playerIntegration = require("../controllers/integration/playerIntegrationController");
const { parseRawEvent } = require("../utils/rawEventSchema");
const { ingestRawEvent } = require("../utils/rawEventIngest");
const { logger } = require("../middlewares/logger");
const { checkApiAccess } = require("../middlewares/planGuard");

// Affiliate bonus distribution: casino verifies a redemption code + reports
// claims back. Operator-authed and called by the casino for the player-bonus
// feature — NOT part of the plan-gated API/webhook surface, so it must work on
// every plan. Mounted BEFORE checkApiAccess so an operator below plusL2 (no
// apiAccess) doesn't have their casino bonus verify/claim calls 403'd.
const bonusOfferController = require("../controllers/affiliate/bonusOfferController");
router.get("/bonus/verify", bonusOfferController.verifyCode);
router.post("/bonus/claim", bonusOfferController.ingestClaim);

// API + webhook access is a plan-gated feature — the remaining integration
// endpoints go through it. Operators on tier1/tier2/plus get a 403 with the
// upgrade hint instead of silently using the integration surface.
router.use(checkApiAccess);

router.post("/activity", importActivity);

// Player registration endpoints — called by operator's backend
router.post("/player/register", playerIntegration.register);
router.post("/player/bulk", playerIntegration.bulkRegister);

// ── Raw event ingestion (single + batch) ─────────────────────────────────────

router.post("/raw-event", async (req, res) => {
  try {
    const operator = req.affiliateUser;
    if (!operator || operator.role !== "operator") {
      return res.status(403).json({ error: "Operator authentication required" });
    }

    const { success, event, data, error } = parseRawEvent(req.body);
    if (!success) {
      return res.status(400).json({ error: `Validation failed: ${error}` });
    }

    // Tenant guard
    const operatorTenantId = String(operator.operatorId);
    if (event.tenantId !== operatorTenantId) {
      return res.status(403).json({
        error: `tenantId mismatch: expected ${operatorTenantId}, got ${event.tenantId}`,
      });
    }

    await ingestRawEvent(event, data);

    return res.status(202).json({ accepted: true, eventId: event.eventId });
  } catch (err) {
    logger.error("integration.rawEvent.error", { error: err.message });
    return res.status(500).json({ error: "Internal error processing event" });
  }
});

router.post("/raw-events", async (req, res) => {
  try {
    const operator = req.affiliateUser;
    if (!operator || operator.role !== "operator") {
      return res.status(403).json({ error: "Operator authentication required" });
    }

    const events = req.body;
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: "Body must be an array of events" });
    }
    if (events.length > 1000) {
      return res.status(400).json({ error: "Maximum 1000 events per batch" });
    }

    const operatorTenantId = String(operator.operatorId);
    const results = { accepted: 0, rejected: 0, errors: [] };

    for (const raw of events) {
      const { success, event, data, error } = parseRawEvent(raw);
      if (!success) {
        results.rejected++;
        results.errors.push({ eventId: raw?.eventId, error });
        continue;
      }
      if (event.tenantId !== operatorTenantId) {
        results.rejected++;
        results.errors.push({ eventId: event.eventId, error: "tenantId mismatch" });
        continue;
      }
      try {
        await ingestRawEvent(event, data);
        results.accepted++;
      } catch (err) {
        results.rejected++;
        results.errors.push({ eventId: event.eventId, error: err.message });
      }
    }

    return res.status(202).json(results);
  } catch (err) {
    logger.error("integration.rawEvents.error", { error: err.message });
    return res.status(500).json({ error: "Internal error processing batch" });
  }
});

module.exports = router;
