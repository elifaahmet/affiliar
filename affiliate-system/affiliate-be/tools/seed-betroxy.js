"use strict";

// One-off onboarding for the Betroxy operator. Mirrors the
// platformAdminController.createOperator flow (operator + pending owner User +
// empty OperatorFinancialSettings + one Brand) but as a server-runnable seed:
//   - offline billing: payment is collected outside the platform, so the whole
//     dunning cadence is skipped — DUNNING_FILTER excludes offlineBilling, and
//     that exclusion is the reason a paid-up customer is never emailed to "pay
//     now", marked past due, or suspended.
//   - does NOT send the activation email; print the activation URL instead so
//     it can be dispatched manually later.
// Idempotent: re-running won't duplicate the operator, owner, or brand.
//
// nextBillingDate still records when the period ends even though nothing will
// act on it. Offline billing means the date does not advance by itself: whoever
// collects the payment moves it, and if nobody does it simply sits in the past
// saying nothing, which is the failure mode to watch for.

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
const PLAN            = "pro";   // apiAccess lives at plusL2 and above; below
                                 // it /integration/* answers 403 and no data
                                 // can be sent at all.
const PERIOD_MONTHS   = 1;

const run = async () => {
  await connectDB();

  // 1. Operator — created, or brought to the intended state if it is already
  //    there.
  //
  //    "Skip if it exists" was wrong and would have been wrong silently. This
  //    operator HAS existed since August as an empty shell: tier1, suspended,
  //    no users, no affiliates. Skipping would have left it exactly that way —
  //    and tier1 has no apiAccess, so the whole point of the activation (taking
  //    their data) would have returned 403 with nothing saying why.
  //
  //    So: reconcile. Every field below is stated, compared, and only written
  //    when it differs, and what changed is printed. A seed that cannot tell
  //    you what it changed on a live record is not one worth running twice.
  let operator = await Operator.findOne({ name: OPERATOR_NAME, isDeleted: { $ne: true } });
  if (operator) {
    const now = new Date();
    const periodEnds = new Date(now);
    periodEnds.setMonth(periodEnds.getMonth() + PERIOD_MONTHS);

    const intended = {
      plan: PLAN,
      billingStatus: "active",
      offlineBilling: true,
      billingIntervalMonths: PERIOD_MONTHS,
      pastDueAt: null,
      trialEndsAt: null,
      approvalStatus: "approved",
    };
    // nextBillingDate is only set when there isn't a sensible one already:
    // an offline operator's date is moved by whoever collects the payment, and
    // overwriting it on a re-run would quietly undo that.
    if (!operator.nextBillingDate || operator.nextBillingDate < now) {
      intended.nextBillingDate = periodEnds;
    }

    const changed = [];
    for (const [k, v] of Object.entries(intended)) {
      const before = operator[k];
      const same = before instanceof Date && v instanceof Date
        ? before.getTime() === v.getTime()
        : String(before ?? "") === String(v ?? "");
      if (!same) {
        changed.push(`${k}: ${before ?? "unset"} -> ${v}`);
        operator[k] = v;
      }
    }
    if (changed.length) {
      await operator.save();
      console.log(`✓ Operator "${operator.name}" (id=${operator.id}) updated:`);
      changed.forEach((c) => console.log(`    ${c}`));
    } else {
      console.log(`Operator "${operator.name}" (id=${operator.id}) already in the intended state.`);
    }
  } else {
    const last = await Operator.findOne({}).sort({ id: -1 }).select({ id: 1 }).lean();
    const nextId = (last?.id ?? 0) + 1;

    const now = new Date();
    const periodEnds = new Date(now);
    periodEnds.setMonth(periodEnds.getMonth() + PERIOD_MONTHS);

    operator = await Operator.create({
      id: nextId,
      name: OPERATOR_NAME,
      plan: PLAN,
      // Active, not trial: they are a paying customer whose payment happens to
      // arrive by hand. Trial would put a clock on an account nobody is going
      // to chase, and past_due would show a "Pay now" banner for an invoice
      // that is settled.
      billingStatus: "active",
      offlineBilling: true,
      billingIntervalMonths: PERIOD_MONTHS,
      pastDueAt: null,
      nextBillingDate: periodEnds,
      trialEndsAt: null,
      activeDiscountCode: "",
    });
    console.log(`✓ Operator created: "${operator.name}" (id=${operator.id}) — plan ${PLAN}, offline billing`);
    console.log(`  period ends ${periodEnds.toISOString().slice(0, 10)} — nothing advances this automatically`);
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
