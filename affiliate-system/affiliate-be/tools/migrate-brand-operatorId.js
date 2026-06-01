/**
 * One-shot migration: Brand.operatorId was historically a User._id (the
 * owner user who created the brand). The schema now references Operator._id
 * directly. For each existing brand: look up the owner User, read their
 * .operatorId field, and rewrite Brand.operatorId to that Operator._id.
 *
 * Idempotent: a brand whose operatorId already references an Operator (not a
 * User) is left alone. Run as many times as needed.
 *
 *   node tools/migrate-brand-operatorId.js
 */
"use strict";

const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("../config/db");
const Brand = require("../models/Brand");
const User = require("../models/User");
const Operator = require("../models/Operator");

(async () => {
  await connectDB();

  const operatorIdSet = new Set(
    (await Operator.find({}).select({ _id: 1 }).lean()).map((o) => String(o._id)),
  );

  const brands = await Brand.find({}).lean();
  let remapped = 0;
  let alreadyOk = 0;
  let unresolved = 0;

  for (const b of brands) {
    const current = String(b.operatorId);

    if (operatorIdSet.has(current)) {
      alreadyOk++;
      continue;
    }

    // current points at a User._id — resolve to that user's operatorId.
    const owner = await User.findById(b.operatorId).select({ operatorId: 1, email: 1 }).lean();
    if (!owner || !owner.operatorId) {
      console.warn(
        `[skip] brand ${b._id} ("${b.name}") points at user ${current} which has no operatorId`,
      );
      unresolved++;
      continue;
    }
    if (!operatorIdSet.has(String(owner.operatorId))) {
      console.warn(
        `[skip] brand ${b._id} ("${b.name}") resolved to operator ${owner.operatorId} which does not exist`,
      );
      unresolved++;
      continue;
    }

    await Brand.updateOne(
      { _id: b._id },
      { $set: { operatorId: owner.operatorId } },
    );
    console.log(
      `[remap] brand ${b._id} ("${b.name}"): user ${current} (${owner.email}) -> operator ${owner.operatorId}`,
    );
    remapped++;
  }

  console.log(
    `\nDone. remapped=${remapped} alreadyOk=${alreadyOk} unresolved=${unresolved} total=${brands.length}`,
  );

  await mongoose.connection.close();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
