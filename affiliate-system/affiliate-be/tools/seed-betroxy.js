"use strict";

// One-off onboarding for the Betroxy operator. Mirrors the
// platformAdminController.createOperator flow (operator + pending owner User +
// empty OperatorFinancialSettings + one Brand) but as a server-runnable seed:
//   - trial mode, but 10-day grace (not the controller's default 3 days)
//   - does NOT send the activation email; print the activation URL instead so
//     it can be dispatched manually later.
// Idempotent: re-running won't duplicate the operator, owner, or brand.

const connectDB                 = require("../config/db");
const Operator                  = require("../models/Operator");
const User                      = require("../models/User");
const Brand                     = require("../models/Brand");
const OperatorFinancialSettings = require("../models/OperatorFinancialSettings");

const OPERATOR_NAME  = "Betroxy";
const OWNER_EMAIL     = "krish@betroxy.com";
const OWNER_NAME      = "Krish";
const OWNER_USERNAME  = "krish_betroxy";
const BRAND_NAME      = "Betroxy";
const BRAND_URL       = null; // set later, e.g. "https://betroxy.com"
const PLAN            = "pro";
const TRIAL_DAYS      = 10;

const run = async () => {
  await connectDB();

  // 1. Operator — skip if one with this name already exists.
  let operator = await Operator.findOne({ name: OPERATOR_NAME, isDeleted: { $ne: true } });
  if (operator) {
    console.log(`Operator "${OPERATOR_NAME}" already exists (id=${operator.id}); skipping create.`);
  } else {
    const last = await Operator.findOne({}).sort({ id: -1 }).select({ id: 1 }).lean();
    const nextId = (last?.id ?? 0) + 1;

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    operator = await Operator.create({
      id: nextId,
      name: OPERATOR_NAME,
      plan: PLAN,
      billingStatus: "trial",
      pastDueAt: null,
      nextBillingDate: trialEndsAt,
      trialEndsAt,
      activeDiscountCode: "",
    });
    console.log(`✓ Operator created: "${operator.name}" (id=${operator.id}) — trial until ${trialEndsAt.toISOString()}`);
  }

  // 2. Owner user — pending until /auth/activate sets a real password.
  let ownerUser = await User.findOne({ email: OWNER_EMAIL.toLowerCase() });
  if (ownerUser) {
    console.log(`Owner user ${OWNER_EMAIL} already exists; linking to operator if needed.`);
    if (String(ownerUser.operatorId) !== String(operator._id)) {
      ownerUser.operatorId = operator._id;
      await ownerUser.save();
      console.log(`  → relinked owner to operator ${operator._id}`);
    }
  } else {
    ownerUser = await User.create({
      email: OWNER_EMAIL.toLowerCase().trim(),
      username: OWNER_USERNAME,
      name: OWNER_NAME,
      password: "PENDING", // unusable until /auth/activate sets it
      role: "operator",
      status: "pending",
      operatorId: operator._id,
      isDeleted: false,
    });
    console.log(`✓ Owner user created: ${ownerUser.email} (pending)`);
  }

  // 3. Empty financial-settings row so the Fees admin page renders.
  const existingSettings = await OperatorFinancialSettings.findOne({
    operatorId: operator._id,
    brandId: null,
  });
  if (existingSettings) {
    console.log("OperatorFinancialSettings (operator-level) already exists; skipping.");
  } else {
    await OperatorFinancialSettings.create({ operatorId: operator._id, brandId: null });
    console.log("✓ OperatorFinancialSettings initialized");
  }

  // 4. Default brand — every operator must have at least one.
  let brand = await Brand.findOne({ operatorId: operator._id, name: BRAND_NAME });
  if (brand) {
    console.log(`Brand "${BRAND_NAME}" already exists for this operator; skipping.`);
  } else {
    const lastBrand = await Brand.findOne({}).sort({ id: -1 }).select({ id: 1 }).lean();
    const nextBrandId = (lastBrand?.id ?? 0) + 1;
    brand = await Brand.create({
      id: nextBrandId,
      name: BRAND_NAME,
      url: BRAND_URL,
      enabled: true,
      operatorId: operator._id,
      products: ["casino", "sportsbook"],
    });
    console.log(`✓ Brand created: "${brand.name}" (id=${brand.id})`);
  }

  console.log("\nBetroxy onboarding complete.");
  console.log(`Activation URL (send manually): ${process.env.APP_URL || ""}/activate?userId=${ownerUser._id}`);
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
