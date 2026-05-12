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
const billingController = require("./controllers/affiliate/billingController");

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
  `${prefix}/billing/callback`,
]);

app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next();
  if (publicAuthPaths.has(req.path)) return next();
  return authorize()(req, res, next);
});

app.use(`${prefix}/auth`, authRoutes);
app.use(`${prefix}/dashboard`, affiliateRoutes.dashboardRoutes);
app.use(`${prefix}/players`, affiliateRoutes.playerRoutes);
app.use(`${prefix}/referral-codes`, affiliateRoutes.referralCodeRoutes);
app.use(`${prefix}/affiliates`, affiliateRoutes.affiliateRoutes);
app.use(`${prefix}/operators`, affiliateRoutes.operatorRoutes);
app.use(`${prefix}/reports`, affiliateRoutes.reportRoutes);
app.use(`${prefix}/brands`,     affiliateRoutes.brandRoutes);
app.use(`${prefix}/commission`,        affiliateRoutes.commissionRoutes);
app.use(`${prefix}/affiliate-portal`, affiliateRoutes.affiliatePortalRoutes);
app.use(`${prefix}/billing`, affiliateRoutes.billingRoutes);
app.use(`${prefix}/fees`, affiliateRoutes.feesRoutes);
app.use(`${prefix}/refer`, affiliateRoutes.referAFriendRoutes);
app.post(`${prefix}/billing/callback`, billingController.handleCallback);
app.use(`${prefix}/integration`, integrationRoutes);

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
});
