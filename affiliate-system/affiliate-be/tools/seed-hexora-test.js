#!/usr/bin/env node
"use strict";

/**
 * Hexora test accounts + dummy data.
 *
 * Creates, under the Hexora operator / hexora.bet brand:
 *   - one operator-role login   (owner level, full dashboard)
 *   - one affiliate-role login  (referral code HEXTEST1 on the Hexora brand)
 *   - a dummy player population in affiliateplayers, matching ClickHouse
 *     activity (casino + sportsbook, deposits, cashouts, bonuses, the odd
 *     chargeback/correction) and a click log for the top of the funnel
 *
 * The dummy rows sit on the real hexora.bet brand, so they count towards
 * Hexora's own reports. Everything is tagged affiliate_id = the test
 * affiliate, which is what --force-data (and any later cleanup) keys on.
 *
 * Both logins get a real password but NO 2FA secret — the login endpoint
 * answers "2FA setup required" + showQrCode, so the recipient enrolls their
 * own authenticator on first sign-in.
 *
 * Idempotent. Re-running skips what exists; --force-data wipes and re-inserts
 * the ClickHouse rows (SummingMergeTree would otherwise double the totals).
 *
 * Usage: node tools/seed-hexora-test.js [--force-data]
 */

require("dotenv").config();

const mongoose   = require("mongoose");
const bcrypt     = require("bcryptjs");
const clickhouse = require("../config/clickhouse");

const FORCE_DATA = process.argv.includes("--force-data");

// ── Targets ───────────────────────────────────────────────────────────────────

const OPERATOR_ID = "69d68b885946ea65a9d805db"; // operators._id — Hexora
const BRAND_ID    = "69d692da55284f229ad805db"; // brands._id   — Hexora (hexora.bet)

const OP_USER = {
  email: "test.operator@hexora.bet",
  username: "hexora_test_operator",
  name: "Hexora Test Operator",
  password: "HexoraTest2026!",
};

const AFF_USER = {
  email: "test.affiliate@hexora.bet",
  username: "hexora_test_affiliate",
  name: "Hexora Test Affiliate",
  password: "HexoraAff2026!",
};

const REFERRAL_CODE = "HEXTEST1";

// ── Dummy population ──────────────────────────────────────────────────────────
// Players are generated, not hand-listed: PLAYER_COUNT of them spread over
// HISTORY_DAYS, deterministic on purpose so a re-seed reproduces the exact
// same numbers.

const PLAYER_COUNT = 32;
const HISTORY_DAYS = 200;

// Share of registrations that never deposit — keeps the reg→FTD funnel honest.
const NO_DEPOSIT_SHARE = 0.22;

const MARKETS = [
  { country: "TR", currency: "TRY", weight: 4 },
  { country: "DE", currency: "EUR", weight: 3 },
  { country: "GB", currency: "GBP", weight: 2 },
  { country: "BR", currency: "USD", weight: 3 },
  { country: "ES", currency: "EUR", weight: 2 },
  { country: "IT", currency: "EUR", weight: 1 },
  { country: "IN", currency: "INR", weight: 1 },
];

const CAMPAIGNS = ["summer-2026", "telegram-vip", "seo-blog", "yt-review", "push-retarget"];

const PROFILES = {
  //              ftd      deposit   daily bet   active   redeposit  cashout   sports?
  whale:   { ftd: 50_000, dep: 30_000, bet: 45_000, days: 0.75, depEvery: 6,  cashEvery: 14, sb: 0    },
  regular: { ftd: 15_000, dep: 10_000, bet: 12_000, days: 0.55, depEvery: 9,  cashEvery: 21, sb: 0    },
  casual:  { ftd:  5_000, dep:  4_000, bet:  3_500, days: 0.30, depEvery: 14, cashEvery: 30, sb: 0    },
  // Sports bettors put most of their turnover through the sportsbook, so the
  // sb_* columns carry the volume and the casino columns stay small.
  sports:  { ftd: 20_000, dep: 12_000, bet:  4_000, days: 0.45, depEvery: 8,  cashEvery: 18, sb: 0.85 },
};

const PROFILE_MIX = ["whale", "regular", "regular", "casual", "casual", "casual", "sports", "sports"];

const PROVIDERS = ["st8", "coco-gamings", "pragmatic", "evolution"];

// Clicks per registered player (top of funnel), plus the ones that never
// converted — that's what makes the click→reg rate look like a real campaign.
const CLICKS_PER_PLAYER = 34;
const BOT_CLICK_SHARE = 0.08;

// Small deterministic PRNG so re-seeding after --force-data reproduces the
// exact same numbers (Math.random would drift every run).
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const chFmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

// Build the player population up front so ClickHouse rows, the affiliateplayers
// registry and the click log all describe the same people.
function buildPlayers() {
  const rnd = mulberry32(20260813);
  const marketPool = MARKETS.flatMap((m) => Array(m.weight).fill(m));

  return Array.from({ length: PLAYER_COUNT }, (_, i) => {
    const market = pick(rnd, marketPool);
    return {
      id: `hextest_p${String(i + 1).padStart(2, "0")}`,
      country: market.country,
      currency: market.currency,
      profile: PROFILE_MIX[i % PROFILE_MIX.length],
      campaign: pick(rnd, CAMPAIGNS),
      // Registrations thin out towards today so the daily chart has a shape.
      regDay: Math.max(1, Math.round(HISTORY_DAYS * Math.pow(rnd(), 0.7))),
      deposits: rnd() > NO_DEPOSIT_SHARE,
    };
  }).sort((a, b) => b.regDay - a.regDay);
}

const PLAYERS = buildPlayers();

// ── Seed ──────────────────────────────────────────────────────────────────────

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const oid = (s) => new mongoose.Types.ObjectId(s);

  const operatorId = oid(OPERATOR_ID);
  const operator = await db.collection("operators").findOne({ _id: operatorId });
  if (!operator) throw new Error(`Operator ${OPERATOR_ID} not found`);
  console.log(`Operator: ${operator.name} (${operator._id})`);

  // 1. The live Hexora brand — dummy activity lands here.
  const brand = await db.collection("brands").findOne({ _id: oid(BRAND_ID), operatorId });
  if (!brand) throw new Error(`Brand ${BRAND_ID} not found under this operator`);
  console.log(`Brand: ${brand.name} — ${brand.url} (${brand._id})`);

  // 2 + 3. The two logins. Password is set here (no invite mail, no /activate
  // step); 2FA is deliberately left unconfigured so the first login walks the
  // recipient through the QR enrolment.
  const upsertUser = async (spec, role) => {
    const existing = await db.collection("users").findOne({ email: spec.email });
    const hashed = await bcrypt.hash(spec.password, 10);
    const now = new Date();

    if (existing) {
      await db.collection("users").updateOne(
        { _id: existing._id },
        {
          $set: {
            password: hashed,
            status: "active",
            role,
            operatorId,
            isDeleted: false,
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorQrScanned: false,
            updatedAt: now,
          },
        },
      );
      console.log(`↻ ${role} user reset: ${spec.email} (${existing._id})`);
      return await db.collection("users").findOne({ _id: existing._id });
    }

    const res = await db.collection("users").insertOne({
      email: spec.email,
      username: spec.username,
      name: spec.name,
      password: hashed,
      role,
      status: "active",
      operatorId,
      brandIds: [],
      isDeleted: false,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorQrScanned: false,
      emailNotifications: true,
      digestFrequency: "weekly",
      quickAccessShortcuts: [],
      createdAt: now,
      updatedAt: now,
    });
    console.log(`✓ ${role} user created: ${spec.email} (${res.insertedId})`);
    return await db.collection("users").findOne({ _id: res.insertedId });
  };

  const opUser  = await upsertUser(OP_USER, "operator");
  const affUser = await upsertUser(AFF_USER, "affiliate");

  // 4. Affiliate profile. operatorUser must be set or the affiliate is
  // invisible to the operator's commission reports (docs §10.1). Pointing it
  // at the test operator keeps the pair self-contained.
  const defaultPlan = await db.collection("commissionplans").findOne({
    operatorId,
    isDefault: true,
    isActive: { $ne: false },
  });

  let profile = await db.collection("affiliateprofiles").findOne({ user: affUser._id });
  if (profile) {
    await db.collection("affiliateprofiles").updateOne(
      { _id: profile._id },
      {
        $set: {
          referralCodes: [REFERRAL_CODE],
          brandCodes: [{ code: REFERRAL_CODE, brandId: brand._id }],
          operatorUser: opUser._id,
          commissionPlanId: defaultPlan?._id ?? null,
          updatedAt: new Date(),
        },
      },
    );
    console.log(`↻ Affiliate profile updated (${profile._id})`);
  } else {
    const now = new Date();
    const res = await db.collection("affiliateprofiles").insertOne({
      user: affUser._id,
      affiliateId: null,
      referralCodes: [REFERRAL_CODE],
      brandCodes: [{ code: REFERRAL_CODE, brandId: brand._id }],
      apiKey: null,
      parentAffiliate: null,
      subPlan: { type: "revshare", revshareRate: 0, cpaSharePercent: 0 },
      overrideRate: 0,
      operatorUser: opUser._id,
      commissionPlanId: defaultPlan?._id ?? null,
      commissionPlans: { casino: null, sportsbook: null, combined: null },
      commissionModel: null,
      postbackEnabled: false,
      postbackUrl: null,
      postbackEvents: ["registration", "ftd"],
      createdAt: now,
      updatedAt: now,
    });
    console.log(`✓ Affiliate profile created (${res.insertedId})`);
  }
  console.log(`  plan: ${defaultPlan ? defaultPlan.name : "none"} | code: ${REFERRAL_CODE}`);

  // 5. Dummy players — registry rows so the Players tabs list them.
  for (const p of PLAYERS) {
    const registeredAt = daysAgo(p.regDay);
    await db.collection("affiliateplayers").updateOne(
      { operatorId, playerId: p.id },
      {
        $set: {
          operatorId,
          brandId: String(brand._id),
          playerId: p.id,
          affiliateId: affUser._id,
          affiliateCode: REFERRAL_CODE,
          campaign: p.campaign,
          subId: `sub_${p.id.slice(-3)}`,
          country: p.country,
          currency: p.currency,
          registeredAt,
          kycLevel: 1,
          fraudFlagged: false,
          isTest: false,
          source: "bulk",
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date(), importedAt: new Date() },
      },
      { upsert: true },
    );
  }
  console.log(`✓ ${PLAYERS.length} dummy players in affiliateplayers`);

  // 6. ClickHouse activity.
  const tenantId = String(operatorId);
  const brandId  = String(brand._id);
  const affId    = String(affUser._id);

  const existing = await clickhouse
    .query({
      query: `SELECT count() AS c FROM activity_hourly_delta WHERE affiliate_id = {aff:String}`,
      query_params: { aff: affId },
      format: "JSONEachRow",
    })
    .then((r) => r.json());
  const existingCount = Number(existing[0]?.c ?? 0);

  if (existingCount > 0 && !FORCE_DATA) {
    console.log(`ClickHouse already has ${existingCount} rows for this affiliate; skipping insert (use --force-data to rebuild).`);
  } else {
    if (existingCount > 0) {
      console.log(`Deleting ${existingCount} existing rows…`);
      await clickhouse.command({
        query: `ALTER TABLE activity_hourly_delta DELETE WHERE affiliate_id = '${affId}'`,
        clickhouse_settings: { mutations_sync: 2 },
      });
    }

    const rows = [];
    const t = { ftdCount: 0, ftd: 0, dep: 0, bets: 0, wins: 0, sbBets: 0, sbWins: 0, cash: 0, cb: 0, bonus: 0 };

    PLAYERS.forEach((p, idx) => {
      const cfg = PROFILES[p.profile];
      const rnd = mulberry32(1000 + idx * 7);
      const common = {
        tenant_id: tenantId,
        brand_id: brandId,
        affiliate_id: affId,
        affiliate_code: REFERRAL_CODE,
        source_system: "seed",
        campaign: p.campaign,
        player_id: p.id,
        currency: p.currency,
        country: p.country,
        sub_id: `sub_${p.id.slice(-3)}`,
      };

      // registration
      const reg = daysAgo(p.regDay);
      reg.setUTCHours(10, 0, 0, 0);
      rows.push({ ...common, hour_bucket: chFmt(reg), registrations: 1 });

      // Registration-only players stop here — they clicked, signed up, never paid.
      if (!p.deposits) return;

      // first deposit, 0-2 days later
      const ftdDay = Math.max(0, p.regDay - Math.floor(rnd() * 3));
      const ftd = daysAgo(ftdDay);
      ftd.setUTCHours(12, 0, 0, 0);
      const ftdAmt = Math.round(cfg.ftd * (0.7 + rnd() * 0.6));
      rows.push({
        ...common,
        hour_bucket: chFmt(ftd),
        ftd_count: 1,
        ftd_sum_cents: ftdAmt,
        deposits_count: 1,
        deposits_sum_cents: ftdAmt,
        payment_system_fees_sum_cents: Math.round(ftdAmt * 0.02),
        deposit_fees_sum_cents: Math.round(ftdAmt * 0.02),
      });
      t.ftdCount++;
      t.ftd += ftdAmt;
      t.dep += ftdAmt;

      // activity from FTD to today
      for (let d = ftdDay; d >= 0; d--) {
        if (rnd() > cfg.days) continue; // not every day is an active day

        const day = daysAgo(d);
        day.setUTCHours(14 + Math.floor(rnd() * 6), 0, 0, 0);
        const bets = Math.round(cfg.bet * (0.4 + rnd() * 1.4));
        const wins = Math.round(bets * (0.82 + rnd() * 0.16)); // 82-98% RTP

        const row = {
          ...common,
          hour_bucket: chFmt(day),
          provider: pick(rnd, PROVIDERS),
          bets_sum_cents: bets,
          wins_sum_cents: wins,
          rounds_count: Math.max(1, Math.round(bets / 250)),
          wager_cents: bets,
        };
        t.bets += bets;
        t.wins += wins;

        // Sportsbook turnover rides on the same day, on the sb_* columns.
        // Provider stays empty there — sportsbook isn't a game provider.
        if (cfg.sb > 0) {
          const sbBets = Math.round((bets / Math.max(0.05, 1 - cfg.sb)) * cfg.sb * (0.6 + rnd() * 0.9));
          const sbWins = Math.round(sbBets * (0.85 + rnd() * 0.14));
          rows.push({
            ...common,
            hour_bucket: chFmt(day),
            sb_bets_sum_cents: sbBets,
            sb_settled_bets_sum_cents: sbBets,
            sb_wins_sum_cents: sbWins,
            ...(rnd() < 0.1 ? { sb_bonus_issues_sum_cents: Math.round(cfg.dep * 0.1) } : {}),
          });
          t.sbBets += sbBets;
          t.sbWins += sbWins;
        }

        const sinceFtd = ftdDay - d;
        if (sinceFtd > 0 && sinceFtd % cfg.depEvery === 0) {
          const amt = Math.round(cfg.dep * (0.6 + rnd() * 0.8));
          row.deposits_count = 1;
          row.deposits_sum_cents = amt;
          row.payment_system_fees_sum_cents = Math.round(amt * 0.02);
          row.deposit_fees_sum_cents = Math.round(amt * 0.02);
          t.dep += amt;
        }
        if (sinceFtd > 0 && sinceFtd % cfg.cashEvery === 0) {
          const amt = Math.round(cfg.dep * (0.4 + rnd() * 0.6));
          row.cashouts_count = 1;
          row.cashouts_sum_cents = amt;
          t.cash += amt;
        }
        if (rnd() < 0.12) {
          const amt = Math.round(cfg.dep * 0.15);
          row.bonus_issues_sum_cents = amt;
          row.casino_bonus_issues_sum_cents = amt;
          t.bonus += amt;
        }
        // Rare: a reversed deposit, and admin wallet corrections either way.
        if (rnd() < 0.015) {
          const amt = Math.round(cfg.dep * (0.5 + rnd() * 0.5));
          row.chargebacks_count = 1;
          row.chargebacks_sum_cents = amt;
          t.cb += amt;
        }
        if (rnd() < 0.03) {
          const amt = Math.round(cfg.dep * 0.1);
          if (rnd() < 0.5) row.corrections_up_sum_cents = amt;
          else row.corrections_down_sum_cents = amt;
        }

        rows.push(row);
      }
    });

    // ClickHouse takes the batch in chunks so a big population doesn't build
    // one oversized request.
    for (let i = 0; i < rows.length; i += 2000) {
      await clickhouse.insert({
        table: "activity_hourly_delta",
        values: rows.slice(i, i + 2000),
        format: "JSONEachRow",
      });
    }

    const usd = (c) => (c / 100).toFixed(2);
    console.log(`✓ ClickHouse: ${rows.length} rows inserted`);
    console.log(`  registrations ${PLAYERS.length} · FTDs ${t.ftdCount} / ${usd(t.ftd)} · deposits ${usd(t.dep)} · cashouts ${usd(t.cash)}`);
    console.log(`  casino bets ${usd(t.bets)} / wins ${usd(t.wins)} → GGR ${usd(t.bets - t.wins)}`);
    console.log(`  sportsbook  bets ${usd(t.sbBets)} / wins ${usd(t.sbWins)} → GGR ${usd(t.sbBets - t.sbWins)}`);
    console.log(`  bonuses ${usd(t.bonus)} · chargebacks ${usd(t.cb)}`);
  }

  // 7. Click log — the top of the funnel the ClickHouse rows can't provide.
  const clickCount = await db.collection("clicks").countDocuments({ affiliateId: affUser._id });
  if (clickCount > 0 && !FORCE_DATA) {
    console.log(`clicks: ${clickCount} already logged; skipping (use --force-data to rebuild).`);
  } else {
    if (clickCount > 0) await db.collection("clicks").deleteMany({ affiliateId: affUser._id });

    const rnd = mulberry32(777);
    const clicks = [];
    const targetUrl = `${brand.url}/?ref=${REFERRAL_CODE}`;

    // One converted click per registered player, dated just before signup…
    PLAYERS.forEach((p, i) => {
      const at = new Date(daysAgo(p.regDay).getTime() - Math.floor(rnd() * 6 * 3600000));
      clicks.push({
        clickId: `hextest_c_${String(i + 1).padStart(4, "0")}`,
        operatorId,
        affiliateId: affUser._id,
        affiliateCode: REFERRAL_CODE,
        brandId: brand._id,
        campaign: p.campaign,
        sub: `sub_${p.id.slice(-3)}`,
        country: p.country,
        targetUrl,
        isBot: false,
        converted: true,
        convertedPlayerId: p.id,
        convertedAt: daysAgo(p.regDay),
        createdAt: at,
        updatedAt: at,
      });
    });

    // …and the rest that never converted, spread over the same window.
    const extra = PLAYER_COUNT * CLICKS_PER_PLAYER - PLAYERS.length;
    for (let i = 0; i < extra; i++) {
      const market = pick(rnd, MARKETS);
      const at = daysAgo(rnd() * HISTORY_DAYS);
      clicks.push({
        clickId: `hextest_cx_${String(i + 1).padStart(4, "0")}`,
        operatorId,
        affiliateId: affUser._id,
        affiliateCode: REFERRAL_CODE,
        brandId: brand._id,
        campaign: pick(rnd, CAMPAIGNS),
        sub: null,
        country: market.country,
        targetUrl,
        isBot: rnd() < BOT_CLICK_SHARE,
        converted: false,
        convertedPlayerId: null,
        convertedAt: null,
        createdAt: at,
        updatedAt: at,
      });
    }

    await db.collection("clicks").insertMany(clicks);
    const bots = clicks.filter((c) => c.isBot).length;
    console.log(`✓ clicks: ${clicks.length} logged (${bots} bot, ${PLAYERS.length} converted)`);
  }

  console.log("\n─── credentials ───");
  console.log(`operator  ${OP_USER.email}  /  ${OP_USER.password}`);
  console.log(`affiliate ${AFF_USER.email}  /  ${AFF_USER.password}`);
  console.log(`2FA: not set — first login shows the QR, they enrol their own authenticator.`);
  console.log(`login: ${process.env.APP_URL || "https://app.affiliar.co"}`);

  await mongoose.disconnect();
  await clickhouse.close();
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
