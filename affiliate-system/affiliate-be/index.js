const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();
const cookieParser = require("cookie-parser");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const authRoutes = require("./routes/authRoutes");
const affiliateRoutes = require("./routes/affiliate");
const integrationRoutes = require("./routes/integrationRoutes");
const authorize = require("./middlewares/auth");
const { blockSuspendedOperator } = require("./middlewares/billingGate");

const connectDB = require("./config/db");
const swaggerOptions = require("./config/swaggerOptions");
const { PORT } = require("./config/api");

const { requestIdMiddleware, logger } = require("./middlewares/logger");
const { MSG } = require("./middlewares/log-messages");

connectDB();

const app = express();

app.use(requestIdMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(helmet());

const protocol = process.env.PROTOCOL;
const baseDomain = process.env.BASE_DOMAIN;
const mainDomain = `${protocol}://${baseDomain}`;
const adminSubDomainurl = `${protocol}://affiliate.${baseDomain}`;
const allowedOrigins = [mainDomain, adminSubDomainurl];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin) || process.env.IS_LOCAL) {
        cb(null, true);
      } else {
        cb(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposedHeaders: ["X-Request-ID"],
  }),
);

const isLocal = process.env.IS_LOCAL || false;
const prefix = isLocal ? "/api" : "";

const publicAuthPaths = new Set([
  `${prefix}/auth/login`,
  `${prefix}/auth/verify-2fa`,
  `${prefix}/auth/generate-2fa-qr`,
  `${prefix}/auth/affiliate-register`,
  `${prefix}/auth/activate`,
  `${prefix}/auth/forgot-password`,
  `${prefix}/auth/reset-password`,
  `${prefix}/auth/dev-token`,
  `${prefix}/billing/coinflux/callback`,
]);

// Affiliate read-only pull API — authenticated by a per-affiliate API key, not
// the session JWT. Mounted before the global authorize() gate so its requests
// take the API-key path instead of the session-cookie one.
app.use(`${prefix}/affiliate-api/v1`, require("./routes/affiliate/affiliateApiRoutes"));

// Public click tracker (smartlink redirect) — end users hit this, so it sits
// before the global auth gate, like the pull API above.
app.use(`${prefix}/r`, require("./routes/affiliate/clickRoutes"));

app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next();
  if (publicAuthPaths.has(req.path)) return next();
  return authorize()(req, res, next);
});

// Hard cut-off for `suspended` operators on every authed route except the
// pay-to-restore loop (/auth, /billing, /admin). Runs after authorize() so
// req.affiliateUser is populated.
app.use(blockSuspendedOperator);

app.use(`${prefix}/auth`, authRoutes);
app.use(`${prefix}/dashboard`, affiliateRoutes.dashboardRoutes);
app.use(`${prefix}/players`, affiliateRoutes.playerRoutes);
app.use(`${prefix}/referral-codes`, affiliateRoutes.referralCodeRoutes);
app.use(`${prefix}/affiliates`, affiliateRoutes.affiliateRoutes);
app.use(`${prefix}/operators`, affiliateRoutes.operatorRoutes);
app.use(`${prefix}/reports`, affiliateRoutes.reportRoutes);
app.use(`${prefix}/fraud`, require("./routes/affiliate/fraudRoutes"));
app.use(`${prefix}/notifications`, require("./routes/affiliate/notificationRoutes"));
app.use(`${prefix}/assistant`, require("./routes/affiliate/assistantRoutes"));
app.use(`${prefix}/announcements`, require("./routes/affiliate/announcementRoutes"));
app.use(`${prefix}/creatives`, require("./routes/affiliate/creativeRoutes"));
app.use(`${prefix}/bonus-offers`, require("./routes/affiliate/bonusOfferRoutes"));
app.use(`${prefix}/brands`,     affiliateRoutes.brandRoutes);
app.use(`${prefix}/commission`,        affiliateRoutes.commissionRoutes);
app.use(`${prefix}/affiliate-portal`, affiliateRoutes.affiliatePortalRoutes);
app.use(`${prefix}/billing`, affiliateRoutes.billingRoutes);
app.use(`${prefix}/fees`, affiliateRoutes.feesRoutes);
app.use(`${prefix}/refer`, affiliateRoutes.referAFriendRoutes);
app.use(`${prefix}/affiliate/payouts`, affiliateRoutes.affiliatePayoutRoutes);
app.use(`${prefix}/integration`, integrationRoutes);
app.use(`${prefix}/admin`, require("./routes/platformAdminRoutes"));

app.get(`${prefix}/health`, (req, res) => {
  try {
    req.logMsg(MSG.HEALTH_OK);
    res.send("pixup-admin API is running");
  } catch (error) {
    req.logMsg(
      { key: "health.error", text: "Health check failed" },
      { error },
      "error",
    );
    res.status(500).send("Health check encountered an error");
  }
});

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.listen(PORT, () => {
  logger.info("server.started", { port: PORT });
  // Keep exchangeRates fresh for the raw-event consumer's FX normalization.
  // Fires immediately on boot and then once per day.
  const { startFxRatesJob } = require("./jobs/fxRatesJob");
  startFxRatesJob();

  // Compute yesterday's operator fees once per day and write them back as
  // deltas to activity_hourly_delta.
  const { startFeesDailyJob } = require("./jobs/feesDailyJob");
  startFeesDailyJob();

  // Refer-a-Friend: re-evaluate pending_qualification referrals daily.
  const { startReferralQualificationJob } = require("./jobs/referralQualificationJob");
  startReferralQualificationJob();

  // Refer-a-Friend: expire stale pending referrals (no FTD or no qualify
  // after N days, default 90) so the qualification job stops re-checking
  // dead rows forever.
  const { startReferralExpiryJob } = require("./jobs/referralExpiryJob");
  startReferralExpiryJob();

  // Refer-a-Friend: monthly % share of the friend's NGR for rewarded
  // referrals (Phase 2 Step 4 recurring rewards). Daily-checked, but
  // only fires on day >=5 of the month for the *previous* month, so
  // ClickHouse aggregates have time to settle.
  const { startReferralRecurringJob } = require("./jobs/referralRecurringJob");
  startReferralRecurringJob();

  // Billing: flip subscriptions past_due once nextBillingDate passes
  // (transition-only) and email the operator's users.
  const { startBillingExpiryJob } = require("./jobs/billingExpiryJob");
  startBillingExpiryJob();

  // Player usage: warn operators (in-app + email) as monthly active players
  // approach their plan's maxPlayers cap — graduated thresholds, once each per
  // month.
  const { startPlayerUsageJob } = require("./jobs/playerUsageJob");
  startPlayerUsageJob();

  // Report digests: weekly (Mon–Sun) + monthly (prev month + commission) emails
  // to operators and affiliates, per each recipient's chosen cadence.
  const { startReportDigestJob, startMonthlyDigestJob } = require("./jobs/reportDigestJob");
  startReportDigestJob();
  startMonthlyDigestJob();

  // Outbound affiliate postbacks: deliver queued conversion notifications
  // (enqueued by the raw Kafka consumer) to each affiliate's URL template.
  const { startPostbackDeliveryJob } = require("./jobs/postbackDeliveryJob");
  startPostbackDeliveryJob();
});
