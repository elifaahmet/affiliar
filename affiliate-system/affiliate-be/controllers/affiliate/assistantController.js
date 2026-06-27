const clickhouse = require("../../config/clickhouse");
const User = require("../../models/User");

// ─────────────────────────────────────────────────────────────────────────────
// "Affiliar Agent" — a rules-based in-app assistant. No LLM: every user message
// is matched against an intent catalogue (TR + EN keywords). A match resolves to
// either a *navigation* hint (role-aware route the UI can push) or a live *data*
// answer (scoped ClickHouse/Mongo query). Anything unmatched returns a short
// suggestion list. The shape is deliberately Claude-ready — swapping the matcher
// for an LLM fallback later means filling in `reply`/`action`/`data` the same way.
// ─────────────────────────────────────────────────────────────────────────────

async function chRows(sql, query_params) {
  const r = await clickhouse.query({ query: sql, query_params, format: "JSONEachRow" });
  return r.json();
}

const eur = (cents) => `€${(Number(cents || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

// Normalise a message for matching: lowercase + strip Turkish diacritics so
// "kazandırdı" and "kazandirdi" both hit.
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .trim();
}
const has = (t, ...words) => words.some((w) => t.includes(norm(w)));

// Canonical destination → role-specific route. null = not available for that role.
const ROUTES = {
  dashboard:        { operator: "/dashboard",                 affiliate: "/affiliate/dashboard" },
  players:          { operator: "/players/list",              affiliate: "/affiliate/players" },
  reports:          { operator: "/reports",                   affiliate: "/affiliate/reports" },
  campaigns:        { operator: "/reports/campaigns",         affiliate: "/affiliate/reports" },
  clicks:           { operator: "/reports/clicks",            affiliate: "/affiliate/reports" },
  fraud:            { operator: "/reports/fraud",             affiliate: null },
  affiliateQuality: { operator: "/reports/affiliate-quality", affiliate: null },
  cohorts:          { operator: "/reports/cohorts",           affiliate: null },
  affiliates:       { operator: "/affiliates",                affiliate: "/affiliate/sub-affiliates" },
  commission:       { operator: "/commission",                affiliate: "/affiliate/commission" },
  bonuses:          { operator: "/bonus-campaigns",           affiliate: "/affiliate/bonuses" },
  payouts:          { operator: "/payouts",                   affiliate: "/affiliate/commission" },
  statements:       { operator: "/billing",                   affiliate: "/affiliate/statements" },
  marketing:        { operator: null,                         affiliate: "/affiliate/marketing" },
  apiAccess:        { operator: null,                         affiliate: "/affiliate/api-access" },
  brands:           { operator: "/brands",                    affiliate: null },
  fees:             { operator: "/fees",                      affiliate: null },
  team:             { operator: "/team",                      affiliate: null },
  referAFriend:     { operator: "/refer-a-friend",            affiliate: null },
  billing:          { operator: "/billing",                   affiliate: null },
  settings:         { operator: "/settings",                  affiliate: null },
  profile:          { operator: "/profile",                   affiliate: "/affiliate/profile" },
};

// Navigation intents, in priority order (first match wins). `label` is shown on
// the "Go" button; `reply` is the assistant's one-liner.
const NAV_INTENTS = [
  { key: "campaigns",        label: "Campaign reports", reply: "Campaign performance lives here.",            test: (t) => has(t, "campaign", "kampanya") },
  { key: "clicks",           label: "Clicks report",    reply: "Click tracking is here.",                     test: (t) => has(t, "click", "tiklama", "tıklama", "smartlink") },
  { key: "fraud",            label: "Anti-fraud",       reply: "Flagged players & fraud review are here.",    test: (t) => has(t, "fraud", "dolandiri", "sahte", "fingerprint", "bot") },
  { key: "affiliateQuality", label: "Affiliate quality",reply: "Affiliate quality & LTV are here.",           test: (t) => has(t, "quality", "kalite", "ltv") },
  { key: "cohorts",          label: "Cohort retention", reply: "Cohort retention is here.",                   test: (t) => has(t, "cohort", "kohort", "retention", "elde tutma") },
  { key: "players",          label: "Players",          reply: "Your players list is here — sortable by NGR/GGR.", test: (t) => has(t, "player", "oyuncu", "uye", "üye") },
  { key: "bonuses",          label: "Bonus campaigns",  reply: "Performance bonus campaigns are here.",       test: (t) => has(t, "bonus", "campaign bonus", "reward", "odul", "ödül", "incentive", "hedef", "target bonus") },
  { key: "commission",       label: "Commission",       reply: "Commission plans & reports are here.",        test: (t) => has(t, "commission", "komisyon", "revshare", "cpa", "revenue share") },
  { key: "payouts",          label: "Payouts",          reply: "Payouts are here.",                           test: (t) => has(t, "payout", "odeme", "ödeme", "mark paid", "withdraw") },
  { key: "statements",       label: "Statements",       reply: "Billing statements / invoices are here.",     test: (t) => has(t, "statement", "invoice", "fatura", "ekstre") },
  { key: "marketing",        label: "Marketing",        reply: "Creatives, banners & links are here.",        test: (t) => has(t, "marketing", "creative", "banner", "afis", "afiş", "reklam") },
  { key: "apiAccess",        label: "API access",       reply: "Your API keys & postback config are here.",   test: (t) => has(t, "api", "postback", "s2s", "webhook") },
  { key: "affiliates",       label: "Affiliates",       reply: "Affiliates are here.",                        test: (t) => has(t, "affiliate", "sub-affiliate", "alt affiliate", "partner") },
  { key: "brands",           label: "Brands",           reply: "Brands are here.",                            test: (t) => has(t, "brand", "marka", "operator") },
  { key: "fees",             label: "Fees",             reply: "Fee policy is here.",                         test: (t) => has(t, "fee", "ucret", "ücret", "ngr policy") },
  { key: "team",             label: "Team",             reply: "Team members are here.",                      test: (t) => has(t, "team", "takim", "takım", "invite", "davet", "uye ekle") },
  { key: "referAFriend",     label: "Refer a friend",   reply: "Refer-a-friend is here.",                     test: (t) => has(t, "refer", "refer a friend", "arkadasini") },
  { key: "billing",          label: "Billing",          reply: "Subscription & billing are here.",            test: (t) => has(t, "billing", "subscription", "abonelik", "plan", "uyelik") },
  { key: "settings",         label: "Settings",         reply: "Settings are here.",                          test: (t) => has(t, "setting", "ayar", "config") },
  { key: "profile",          label: "Profile",          reply: "Your profile is here.",                       test: (t) => has(t, "profile", "profil", "hesap", "account") },
  { key: "reports",          label: "Reports",          reply: "Reports & analytics are here.",               test: (t) => has(t, "report", "rapor", "analytic", "analitik", "istatistik") },
  { key: "dashboard",        label: "Dashboard",        reply: "Heading to your dashboard.",                  test: (t) => has(t, "dashboard", "anasayfa", "ana sayfa", "ozet", "özet", "home") },
];

// Named months → index, matched on the *normalised* text (Turkish diacritics
// already stripped: şubat→subat, mayıs→mayis, ağustos→agustos, etc.).
const MONTHS = {
  january: 0, jan: 0, ocak: 0,
  february: 1, feb: 1, subat: 1,
  march: 2, mar: 2, mart: 2,
  april: 3, apr: 3, nisan: 3,
  may: 4, mayis: 4,
  june: 5, jun: 5, haziran: 5,
  july: 6, jul: 6, temmuz: 6,
  august: 7, aug: 7, agustos: 7,
  september: 8, sep: 8, sept: 8, eylul: 8,
  october: 9, oct: 9, ekim: 9,
  november: 10, nov: 10, kasim: 10,
  december: 11, dec: 11, aralik: 11,
};
const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Period detection from free text. Defaults to the current month.
function parsePeriod(t) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const span = (from, to, label) => ({
    from: `${fmt(from)} 00:00:00`,
    to: `${fmt(to)} 23:59:59`,
    label,
  });
  if (has(t, "today", "bugun")) return span(new Date(Date.UTC(y, m, now.getUTCDate())), new Date(Date.UTC(y, m, now.getUTCDate())), "today");
  if (has(t, "yesterday", "dun")) { const d = new Date(Date.UTC(y, m, now.getUTCDate() - 1)); return span(d, d, "yesterday"); }
  if (has(t, "last month", "gecen ay", "onceki ay")) return span(new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 0)), "last month");
  if (has(t, "this year", "bu yil")) return span(new Date(Date.UTC(y, 0, 1)), new Date(Date.UTC(y, 11, 31)), "this year");
  if (has(t, "all time", "tum zaman", "her zaman")) return span(new Date(Date.UTC(2000, 0, 1)), new Date(Date.UTC(y, 11, 31)), "all time");

  const today = new Date(Date.UTC(y, m, now.getUTCDate()));
  const daysAgo = (n) => new Date(Date.UTC(y, m, now.getUTCDate() - n));

  // Calendar weeks (Monday-start).
  const dowMon = (now.getUTCDay() + 6) % 7; // 0 = Monday
  if (has(t, "this week", "bu hafta")) return span(daysAgo(dowMon), today, "this week");
  if (has(t, "last week", "gecen hafta", "onceki hafta", "past week", "son hafta")) {
    return span(daysAgo(dowMon + 7), daysAgo(dowMon + 1), "last week");
  }

  // Rolling window: "last N days" / "son N gün" (e.g. last 7 days, son 30 gun).
  const dayMatch = t.match(/\b(?:last|son|gecen)\s+(\d{1,3})\s*(?:days?|gun)\b/);
  if (dayMatch) {
    const n = Math.min(Math.max(Number(dayMatch[1]) || 1, 1), 365);
    return span(daysAgo(n - 1), today, `last ${n} days`);
  }
  if (has(t, "son bir hafta", "past 7 days")) return span(daysAgo(6), today, "last 7 days");

  // Named month, e.g. "april", "nisan", optionally with a 4-digit year.
  for (const [name, idx] of Object.entries(MONTHS)) {
    if (!new RegExp(`\\b${name}\\b`).test(t)) continue;
    const yearMatch = t.match(/\b(20\d{2})\b/);
    // No explicit year: use current year, unless that month is still in the
    // future (e.g. "december" asked in June) → assume last year.
    const year = yearMatch ? Number(yearMatch[1]) : (idx > m ? y - 1 : y);
    return span(new Date(Date.UTC(year, idx, 1)), new Date(Date.UTC(year, idx + 1, 0)), `${MONTH_LABELS[idx]} ${year}`);
  }

  return span(new Date(Date.UTC(y, m, 1)), new Date(Date.UTC(y, m + 1, 0)), "this month");
}

// Build the scoped ClickHouse WHERE for the requesting user.
function chScope(user, period, { excludeFees = true } = {}) {
  const conds = ["tenant_id = {tenantId:String}", "from_ts >= {fromTs:DateTime}", "from_ts <= {toTs:DateTime}"];
  const cp = { tenantId: user.operatorId.toString(), fromTs: period.from, toTs: period.to };
  if (excludeFees) conds.push("player_id != '__fees__'");
  if (user.role === "affiliate") { conds.push("affiliate_id = {affId:String}"); cp.affId = String(user._id); }
  if (user.role === "operator" && Array.isArray(user.brandIds) && user.brandIds.length > 0) {
    conds.push("brand_id IN ({brandIds:Array(String)})"); cp.brandIds = user.brandIds.map(String);
  }
  return { where: conds.join(" AND "), cp };
}

// ── Data answers ─────────────────────────────────────────────────────────────

async function answerSummary(user, period) {
  const { where, cp } = chScope(user, period);
  const rows = await chRows(
    `SELECT SUM(casino_ngr_cents) AS ngr, SUM(casino_ggr_cents) AS ggr,
            SUM(deposits_sum_cents) AS deposits, SUM(ftd_count) AS ftd
     FROM affiliate.activity WHERE ${where} AND affiliate_id != ''`,
    cp,
  );
  const r = rows[0] || {};
  return {
    reply: `Totals for ${period.label}:`,
    data: {
      kind: "summary",
      label: period.label,
      items: [
        { label: "NGR", value: eur(r.ngr) },
        { label: "GGR", value: eur(r.ggr) },
        { label: "Deposits", value: eur(r.deposits) },
        { label: "FTDs", value: String(Number(r.ftd || 0)) },
      ],
    },
  };
}

async function answerTopAffiliates(user, period) {
  const { where, cp } = chScope(user, period);
  const rows = await chRows(
    `SELECT affiliate_id AS id, SUM(casino_ngr_cents) AS ngr
     FROM affiliate.activity WHERE ${where} AND affiliate_id != ''
     GROUP BY affiliate_id ORDER BY ngr DESC LIMIT 5`,
    cp,
  );
  if (!rows.length) return { reply: `No affiliate activity for ${period.label} yet.`, data: null };
  const ids = rows.map((r) => r.id);
  const users = await User.find({ _id: { $in: ids } }).select("username email name").lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return {
    reply: `Top affiliates by NGR (${period.label}):`,
    data: {
      kind: "ranking",
      label: period.label,
      action: { type: "navigate", route: ROUTES.affiliateQuality.operator, label: "Affiliate quality" },
      rows: rows.map((r, i) => {
        const u = byId.get(String(r.id));
        return { rank: i + 1, name: (u && (u.name || u.username || u.email)) || String(r.id), value: eur(r.ngr) };
      }),
    },
  };
}

async function answerTopPlayers(user, period) {
  const { where, cp } = chScope(user, period);
  const rows = await chRows(
    `SELECT player_id AS id, SUM(casino_ngr_cents) AS ngr
     FROM affiliate.activity WHERE ${where} AND affiliate_id != ''
     GROUP BY player_id ORDER BY ngr DESC LIMIT 5`,
    cp,
  );
  if (!rows.length) return { reply: `No player activity for ${period.label} yet.`, data: null };
  const route = ROUTES.players[user.role];
  return {
    reply: `Top players by NGR (${period.label}):`,
    data: {
      kind: "ranking",
      label: period.label,
      action: route ? { type: "navigate", route, label: "Players" } : null,
      rows: rows.map((r, i) => ({ rank: i + 1, name: String(r.id), value: eur(r.ngr) })),
    },
  };
}

async function answerNewAffiliates(operator, period) {
  const count = await User.countDocuments({
    role: "affiliate",
    operatorId: operator.operatorId,
    isDeleted: { $ne: true },
    createdAt: {
      $gte: new Date(period.from.replace(" ", "T") + "Z"),
      $lte: new Date(period.to.replace(" ", "T") + "Z"),
    },
  });
  return {
    reply: `New affiliates (${period.label}):`,
    data: {
      kind: "summary",
      label: period.label,
      action: { type: "navigate", route: ROUTES.affiliates.operator, label: "Affiliates" },
      items: [{ label: "New affiliates", value: String(count) }],
    },
  };
}

// Static informational answers (FAQ) — no data query, optional route. Checked
// before navigation so "how do commissions work" explains rather than just
// jumping to a page.
const FAQ_INTENTS = [
  // ── Postback / S2S help (specific before general) ──────────────────────────
  { roles: ["affiliate", "operator"], routeKey: "apiAccess",
    test: (t) => has(t, "postback", "s2s", "callback") && has(t, "macro", "parameter", "parametre", "variable", "token", "placeholder", "field", "alan"),
    reply: "Postback macros — use these in your URL template:\n• {click_id} / {sub_id} — your own ID from the tracking link (same value)\n• {event} — registration | ftd | deposit\n• {player_id} — the operator's player ID\n• {amount} — major units (e.g. 12.50) · {amount_cents} — integer cents\n• {currency}\n• {affiliate_code} · {brand_id}\n• {timestamp} — unix seconds\nValues are URI-encoded; unknown macros are left as-is so typos are visible." },
  { roles: ["affiliate", "operator"], routeKey: "apiAccess",
    test: (t) => has(t, "sub_id", "subid", "sub id") || (has(t, "postback", "s2s", "player") && has(t, "match", "esle", "eslestir", "map", "mapping", "own id", "kendi", "my user", "my player")),
    reply: "Matching players to your own users:\nPut your own click/visitor ID on the tracking link as sub_id. It comes back on every postback as {sub_id} (= {click_id}), so you can map the operator's {player_id} to your user.\nDidn't pass sub_id at click time? You can still map a player to your external reference after the fact from the API Access page." },
  { roles: ["affiliate", "operator"], routeKey: "apiAccess",
    test: (t) => has(t, "postback", "s2s") && has(t, "event", "when", "ne zaman", "fire", "trigger", "tetik", "hangi"),
    reply: "Postbacks fire on these events (pick any subset on the API Access page):\n• registration — a referred player signs up\n• ftd — their first deposit\n• deposit — every subsequent deposit\nEach fires a server-to-server GET to your URL with {event} set accordingly." },
  { roles: ["affiliate", "operator"], routeKey: "apiAccess",
    test: (t) => has(t, "postback", "s2s", "callback", "server to server", "server-to-server", "pixel"),
    reply: "Set up your S2S postback on the API Access page:\n1. Paste your postback URL template (use {macros})\n2. Choose which events fire: registration, ftd, deposit\n3. Toggle it on\nWe send a server-to-server GET to your URL on each matching event (URI-encoded values).\nMacros: {click_id} / {sub_id}, {event}, {player_id}, {amount}, {amount_cents}, {currency}, {affiliate_code}, {brand_id}, {timestamp}\nExample: https://you.com/pb?cid={sub_id}&event={event}&amt={amount}" },

  { roles: ["affiliate"], routeKey: "commission",
    test: (t) => (has(t, "when") && has(t, "paid", "payout", "pay")) || has(t, "ne zaman odeme", "ne zaman alir", "ne zaman para", "payout schedule", "odeme ne zaman"),
    reply: "Commissions are tallied monthly. Once your operator approves the report, your payout is sent — track the status (Draft → Approved → Paid) on your Commission page." },
  { roles: ["affiliate"], routeKey: "commission",
    test: (t) => has(t, "minimum") && has(t, "payout", "odeme", "withdraw", "pay"),
    reply: "Minimum payout thresholds are set by your operator, not a fixed Affiliar number. Your approved commission shows on the Commission page — check with your operator for their threshold." },
  { roles: ["affiliate"], routeKey: "commission",
    test: (t) => (has(t, "how", "nasil") && has(t, "commission", "komisyon", "earn", "kazan")) || has(t, "my plan", "planim", "what plan"),
    reply: "Your earnings follow the plan your operator assigned — RevShare, CPA, hybrid or tiered. See your active plan and current earnings on the Commission page." },
  { roles: ["affiliate"], routeKey: "marketing",
    test: (t) => has(t, "referral link", "tracking link", "my link", "linkim", "link nerede", "where is my link", "get my link"),
    reply: "Your tracking links & referral codes live on the Marketing page — copy a link, add a campaign tag, and share." },
  { roles: ["operator"], routeKey: "affiliates",
    test: (t) => has(t, "invite", "davet", "add affiliate", "affiliate ekle", "yeni affiliate ekle") && has(t, "affiliate"),
    reply: "Add or invite affiliates from the Affiliates page — use the Add tabs, or send an email invite so they set their own password." },
  { roles: ["operator"], routeKey: "affiliates",
    test: (t) => has(t, "announce", "announcement", "broadcast", "duyuru", "update mail", "toplu mail", "send update"),
    reply: "Use the 📣 Announce button on the Affiliates page to send a one-off update to all your affiliates — in-app + email, respecting each affiliate's notification preferences." },
];

const SUGGESTIONS = {
  operator: [
    "Top affiliates last 7 days",
    "New affiliates this month",
    "This month NGR / FTD",
    "Open campaign reports",
    "Show anti-fraud",
  ],
  affiliate: [
    "Top players last 7 days",
    "My NGR last month",
    "How do I set up postback?",
    "Postback macros",
    "Show my statements",
  ],
};

const assistantController = {
  // POST /assistant/ask  { message }
  async ask(req, res) {
    try {
      const user = req.affiliateUser;
      if (!["operator", "affiliate"].includes(user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const raw = String(req.body?.message || "").slice(0, 500);
      const t = norm(raw);
      if (!t) {
        return res.json({ reply: "Hi! Ask me where something is, or about your numbers.", suggestions: SUGGESTIONS[user.role] });
      }

      // ── Data intents (checked before navigation so "top affiliate" answers
      // with numbers rather than just routing to a page) ──────────────────────
      const period = parsePeriod(t);
      const wantsTop = has(t, "top", "en cok", "en fazla", "most", "kazandir", "earned", "best", "biggest", "highest", "en iyi");

      if (wantsTop && user.role === "operator" && has(t, "affiliate", "partner")) {
        return res.json(await answerTopAffiliates(user, period));
      }
      if (wantsTop && has(t, "player", "oyuncu", "uye")) {
        return res.json(await answerTopPlayers(user, period));
      }
      if (wantsTop && user.role === "operator") {
        // "who earned the most" with no noun → affiliates for operators
        return res.json(await answerTopAffiliates(user, period));
      }
      if (wantsTop) {
        return res.json(await answerTopPlayers(user, period));
      }
      if (user.role === "operator" && has(t, "affiliate", "signup", "uye") && has(t, "new", "yeni", "how many", "kac", "count", "joined", "katil")) {
        return res.json(await answerNewAffiliates(user, period));
      }
      if (has(t, "ngr", "ggr", "ftd", "deposit", "yatirim", "ciro", "revenue", "summary", "ozet", "how much", "ne kadar", "kac", "rakam", "total")) {
        return res.json(await answerSummary(user, period));
      }

      // ── FAQ (static answers, optional route) ────────────────────────────────
      for (const f of FAQ_INTENTS) {
        if (!f.roles.includes(user.role) || !f.test(t)) continue;
        const route = f.routeKey ? ROUTES[f.routeKey]?.[user.role] : null;
        return res.json({ reply: f.reply, action: route ? { type: "navigate", route, label: NAV_INTENTS.find((n) => n.key === f.routeKey)?.label || "Open" } : null });
      }

      // ── Navigation intents ──────────────────────────────────────────────────
      for (const intent of NAV_INTENTS) {
        if (!intent.test(t)) continue;
        const route = ROUTES[intent.key]?.[user.role];
        if (!route) {
          return res.json({ reply: `“${intent.label}” isn't available on your account.`, suggestions: SUGGESTIONS[user.role] });
        }
        return res.json({ reply: intent.reply, action: { type: "navigate", route, label: intent.label } });
      }

      // ── No match → suggestions (the no-LLM graceful fallback) ───────────────
      return res.json({
        reply: "I didn't catch that. Try one of these:",
        suggestions: SUGGESTIONS[user.role],
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

module.exports = assistantController;
