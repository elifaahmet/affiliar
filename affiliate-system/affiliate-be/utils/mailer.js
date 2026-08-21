const postmark = require("postmark");
const { logger } = require("../middlewares/logger");

const POSTMARK_TOKEN = process.env.POSTMARK_TOKEN;
const FROM_EMAIL = process.env.MAIL_FROM || "hello@affiliar.co";
const APP_URL = process.env.APP_URL || "https://app.affiliar.co";

let client = null;
if (POSTMARK_TOKEN) {
  client = new postmark.ServerClient(POSTMARK_TOKEN);
} else {
  logger.warn("mailer.disabled — POSTMARK_TOKEN not set");
}

// Cache-buster query string on the email logo URL. Bump this whenever the
// SVG content changes — Cloudflare caches /affiliar-logo-email.svg for 4h,
// and a query change forces a fresh fetch on the recipient's email client.
const LOGO_VERSION = "v2-violet";
const LOGO_URL = `${APP_URL}/affiliar-logo-email.svg?${LOGO_VERSION}`;

async function sendMail({ to, subject, htmlBody, textBody }) {
  if (!client) {
    logger.warn("mailer.skip", { to, subject });
    return null;
  }
  try {
    const result = await client.sendEmail({
      From: FROM_EMAIL,
      To: to,
      Subject: subject,
      HtmlBody: htmlBody,
      TextBody: textBody,
      MessageStream: "outbound",
    });
    logger.info("mailer.sent", { to, subject, messageId: result.MessageID });
    return result;
  } catch (err) {
    logger.error("mailer.error", { to, subject, error: err.message });
    throw err;
  }
}

async function sendAffiliateInvite({ to, name, userId, operatorName }) {
  const activateUrl = `${APP_URL}/activate?userId=${userId}`;
  const logoUrl = LOGO_URL;
  const subject = `${operatorName || "Affiliar"} invited you to join their affiliate program`;
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px 30px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${logoUrl}" alt="Affiliar" width="160" style="display: inline-block;" />
      </div>
      <h2 style="color: #1E3A5F; margin-top: 0;">You're invited!</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hi ${name || "there"},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">${operatorName || "An operator"} has invited you to join their affiliate program on Affiliar.</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">Click the button below to set your password and activate your account:</p>
      <p style="margin: 32px 0; text-align: center;">
        <a href="${activateUrl}"
           style="background: #2563EB; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
          Activate Account
        </a>
      </p>
      <p style="color: #64748B; font-size: 13px; line-height: 1.5;">Or copy this link into your browser:<br/>
      <a href="${activateUrl}" style="color: #2563EB; word-break: break-all;">${activateUrl}</a></p>
      <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 32px 0;" />
      <p style="color: #94A3B8; font-size: 12px; text-align: center;">If you didn't expect this email, you can safely ignore it.</p>
    </div>
  `;
  const textBody = `Hi ${name || "there"},\n\n${operatorName || "An operator"} has invited you to join their affiliate program on Affiliar.\n\nActivate your account:\n${activateUrl}\n\nIf you didn't expect this email, you can safely ignore it.`;

  return sendMail({ to, subject, htmlBody, textBody });
}

async function sendOperatorInvite({ to, name, userId, operatorName, planName }) {
  const activateUrl = `${APP_URL}/activate?userId=${userId}`;
  const logoUrl = LOGO_URL;
  const subject = `Welcome to Affiliar — set up your ${operatorName || "operator"} account`;
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px 30px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${logoUrl}" alt="Affiliar" width="160" style="display: inline-block;" />
      </div>
      <h2 style="color: #1E3A5F; margin-top: 0;">Welcome aboard!</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hi ${name || "there"},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">Your <b>${operatorName || "operator"}</b> account is ready${planName ? ` on the <b>${planName}</b> plan` : ""}. Click below to set your password and start configuring your brands, fees, and commission plans.</p>
      <p style="margin: 32px 0; text-align: center;">
        <a href="${activateUrl}"
           style="background: #7C3AED; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
          Activate Account
        </a>
      </p>
      <p style="color: #64748B; font-size: 13px; line-height: 1.5;">Or copy this link into your browser:<br/>
      <a href="${activateUrl}" style="color: #7C3AED; word-break: break-all;">${activateUrl}</a></p>
      <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 32px 0;" />
      <p style="color: #94A3B8; font-size: 12px; text-align: center;">If you didn't expect this email, please ignore it or let us know.</p>
    </div>
  `;
  const textBody = `Hi ${name || "there"},\n\nYour ${operatorName || "operator"} account is ready${planName ? ` on the ${planName} plan` : ""}. Activate it here:\n${activateUrl}\n\nIf you didn't expect this email, please ignore it.`;

  return sendMail({ to, subject, htmlBody, textBody });
}

async function sendPasswordReset({ to, name, token }) {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
  const logoUrl = LOGO_URL;
  const subject = "Reset your Affiliar password";
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px 30px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${logoUrl}" alt="Affiliar" width="160" style="display: inline-block;" />
      </div>
      <h2 style="color: #1E3A5F; margin-top: 0;">Reset your password</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hi ${name || "there"},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">We received a request to reset your Affiliar password. Click the button below to set a new one:</p>
      <p style="margin: 32px 0; text-align: center;">
        <a href="${resetUrl}"
           style="background: #2563EB; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
          Reset Password
        </a>
      </p>
      <p style="color: #64748B; font-size: 13px; line-height: 1.5;">Or copy this link into your browser:<br/>
      <a href="${resetUrl}" style="color: #2563EB; word-break: break-all;">${resetUrl}</a></p>
      <p style="color: #64748B; font-size: 13px;">This link will expire in 1 hour.</p>
      <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 32px 0;" />
      <p style="color: #94A3B8; font-size: 12px; text-align: center;">If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
  `;
  const textBody = `Hi ${name || "there"},\n\nWe received a request to reset your Affiliar password.\n\nReset your password:\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request a password reset, you can safely ignore this email.`;

  return sendMail({ to, subject, htmlBody, textBody });
}

async function sendBillingPastDue({ to, name, planName, dueDate }) {
  const billingUrl = `${APP_URL}/billing`;
  const logoUrl = LOGO_URL;
  const niceDate = new Date(dueDate).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
  const subject = "Your Affiliar subscription payment is overdue";
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px 30px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${logoUrl}" alt="Affiliar" width="160" style="display: inline-block;" />
      </div>
      <h2 style="color: #B91C1C; margin-top: 0;">Payment overdue</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hi ${name || "there"},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">Your Affiliar subscription${planName ? ` (${planName})` : ""} was due on <b>${niceDate}</b> and is now past due. To avoid limited access to your operator panel, please settle the payment as soon as possible.</p>
      <p style="margin: 32px 0; text-align: center;">
        <a href="${billingUrl}"
           style="background: #B91C1C; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
          Pay now
        </a>
      </p>
      <p style="color: #64748B; font-size: 13px; line-height: 1.5;">Or open the billing page directly:<br/>
      <a href="${billingUrl}" style="color: #2563EB; word-break: break-all;">${billingUrl}</a></p>
      <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 32px 0;" />
      <p style="color: #94A3B8; font-size: 12px; text-align: center;">If you've already paid, you can ignore this email — it may take a few minutes for the provider to confirm.</p>
    </div>
  `;
  const textBody = `Hi ${name || "there"},\n\nYour Affiliar subscription${planName ? ` (${planName})` : ""} was due on ${niceDate} and is now past due.\n\nPay now: ${billingUrl}\n\nIf you've already paid, ignore this email.`;

  return sendMail({ to, subject, htmlBody, textBody });
}

// ── Billing reminder cadence ─────────────────────────────────────────────────
//
// The billingExpiryJob walks operators daily and picks the right reminder for
// where they sit on the timeline:
//
//   -7d / -3d   →  sendBillingUpcoming         (heads-up before due, monthly only)
//    0d         →  sendBillingDueToday         (trial end / paid grace expires today)
//   +2d / +4d   →  sendBillingPastDueReminder  (sparse reminders, with countdown)
//   +7d         →  sendBillingSuspendedNotice  (after the hard cut-off flip)
//
// All four share the same shell (logo, button, text body) so the operator
// sees a consistent thread of messages; only the headline + body copy + CTA
// tone shift as the urgency increases.

function billingShell({ logoUrl, billingUrl, headline, headlineColor, bodyHtml, ctaLabel, ctaColor, footerHtml }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px 30px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${logoUrl}" alt="Affiliar" width="160" style="display: inline-block;" />
      </div>
      <h2 style="color: ${headlineColor}; margin-top: 0;">${headline}</h2>
      ${bodyHtml}
      <p style="margin: 32px 0; text-align: center;">
        <a href="${billingUrl}"
           style="background: ${ctaColor}; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
          ${ctaLabel}
        </a>
      </p>
      <p style="color: #64748B; font-size: 13px; line-height: 1.5;">Or open the billing page directly:<br/>
      <a href="${billingUrl}" style="color: #6D28D9; word-break: break-all;">${billingUrl}</a></p>
      <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 32px 0;" />
      ${footerHtml}
    </div>
  `;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

// -7d and -3d both use this — `daysUntilDue` differentiates the wording.
async function sendBillingUpcoming({ to, name, planName, dueDate, daysUntilDue }) {
  const billingUrl = `${APP_URL}/billing`;
  const logoUrl = LOGO_URL;
  const niceDate = fmtDate(dueDate);
  const subject = `Affiliar subscription payment due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`;

  const bodyHtml = `
    <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hi ${name || "there"},</p>
    <p style="color: #334155; font-size: 15px; line-height: 1.6;">A heads-up: your Affiliar subscription${planName ? ` (${planName})` : ""} is due on <b>${niceDate}</b> — that's <b>${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}</b> from now.</p>
    <p style="color: #334155; font-size: 15px; line-height: 1.6;">You can settle it now from the billing page so nothing interrupts your operator panel access.</p>
  `;
  const footerHtml = `<p style="color: #94A3B8; font-size: 12px; text-align: center;">You're receiving this because your billing date is approaching. No action needed if you've already paid.</p>`;
  const htmlBody = billingShell({
    logoUrl, billingUrl,
    headline: "Payment coming up",
    headlineColor: "#6D28D9",
    bodyHtml,
    ctaLabel: "Pay now",
    ctaColor: "#6D28D9",
    footerHtml,
  });
  const textBody = `Hi ${name || "there"},\n\nYour Affiliar subscription${planName ? ` (${planName})` : ""} is due on ${niceDate} (in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}).\n\nPay now: ${billingUrl}`;

  return sendMail({ to, subject, htmlBody, textBody });
}

// Day-of due date. Operator still has the day to pay before sliding into
// past_due, so the tone is firm but not punitive yet.
async function sendBillingDueToday({ to, name, planName, dueDate }) {
  const billingUrl = `${APP_URL}/billing`;
  const logoUrl = LOGO_URL;
  const niceDate = fmtDate(dueDate);
  const subject = "Your Affiliar subscription payment is due today";

  const bodyHtml = `
    <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hi ${name || "there"},</p>
    <p style="color: #334155; font-size: 15px; line-height: 1.6;">Your Affiliar subscription${planName ? ` (${planName})` : ""} is due <b>today</b> (${niceDate}). Pay now to keep everything running without a hitch.</p>
  `;
  const footerHtml = `<p style="color: #94A3B8; font-size: 12px; text-align: center;">If you've already paid, it can take a few minutes for the provider to confirm — you can safely ignore this email in that case.</p>`;
  const htmlBody = billingShell({
    logoUrl, billingUrl,
    headline: "Payment due today",
    headlineColor: "#B45309",
    bodyHtml,
    ctaLabel: "Pay now",
    ctaColor: "#B45309",
    footerHtml,
  });
  const textBody = `Hi ${name || "there"},\n\nYour Affiliar subscription${planName ? ` (${planName})` : ""} is due today (${niceDate}).\n\nPay now: ${billingUrl}`;

  return sendMail({ to, subject, htmlBody, textBody });
}

// Sparse post-due reminders at +2 / +4 days overdue. The "service will be
// suspended in N days" countdown anchors against SUSPEND_AFTER_DAYS (+7d).
async function sendBillingPastDueReminder({ to, name, planName, dueDate, daysOverdue, daysUntilSuspension, interestCents = 0, dailyInterestPercent = 0, suspendAfterDays = 10 }) {
  const billingUrl = `${APP_URL}/billing`;
  const logoUrl = LOGO_URL;
  const niceDate = fmtDate(dueDate);
  // Spell out the calendar date service stops, not just "in N days" — a
  // recipient reading this a day later would otherwise count from the wrong day.
  const suspendOn = fmtDate(new Date(new Date(dueDate).getTime() + suspendAfterDays * 86400000));
  const interestLine = interestCents > 0
    ? `<p style="color: #334155; font-size: 15px; line-height: 1.6;">Late interest of <b>${dailyInterestPercent}% per day</b> has been applied since the due date, currently <b>$${(interestCents / 100).toFixed(2)}</b>, and continues to accrue daily until the invoice is settled.</p>`
    : "";
  const interestText = interestCents > 0
    ? `\n\nLate interest of ${dailyInterestPercent}% per day has been applied since the due date, currently $${(interestCents / 100).toFixed(2)}, and continues to accrue daily.`
    : "";
  const subject = `Payment overdue — service will be suspended in ${daysUntilSuspension} day${daysUntilSuspension === 1 ? "" : "s"}`;

  const bodyHtml = `
    <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hi ${name || "there"},</p>
    <p style="color: #334155; font-size: 15px; line-height: 1.6;">Your Affiliar subscription${planName ? ` (${planName})` : ""} was due on <b>${niceDate}</b> and is now <b>${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue</b>.</p>
    <div style="background: #FEF3C7; border-left: 4px solid #D97706; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
      <p style="color: #92400E; font-size: 14px; line-height: 1.5; margin: 0;">Service will be suspended on <b>${suspendOn}</b>, in ${daysUntilSuspension} day${daysUntilSuspension === 1 ? "" : "s"}, if payment isn't received.</p>
      <p style="color: #92400E; font-size: 14px; line-height: 1.5; margin: 8px 0 0;">From that date <b>no further activity is recorded</b> — clicks, registrations, deposits and player activity that happen while suspended are not captured and cannot be recovered afterwards, so any commission owed for that period cannot be reconstructed.</p>
    </div>
    ${interestLine}
  `;
  const footerHtml = `<p style="color: #94A3B8; font-size: 12px; text-align: center;">Already paid? Provider confirmations can take a few minutes — you can ignore this email if so.</p>`;
  const htmlBody = billingShell({
    logoUrl, billingUrl,
    headline: "Payment overdue",
    headlineColor: "#B91C1C",
    bodyHtml,
    ctaLabel: "Pay now",
    ctaColor: "#B91C1C",
    footerHtml,
  });
  const textBody = `Hi ${name || "there"},\n\nYour Affiliar subscription${planName ? ` (${planName})` : ""} was due on ${niceDate} and is now ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue.${interestText}\n\nService will be suspended on ${suspendOn}, in ${daysUntilSuspension} day${daysUntilSuspension === 1 ? "" : "s"}, if payment isn't received. From that date no further activity is recorded — clicks, registrations, deposits and player activity during suspension are not captured and cannot be recovered.\n\nPay now: ${billingUrl}`;

  return sendMail({ to, subject, htmlBody, textBody });
}

// +7 days overdue — the suspended-notice email. By the time this fires
// the operator has already been flipped to `billingStatus: 'suspended'`
// and the panel gate is blocking their requests; this email tells them
// what happened and how to restore service.
async function sendBillingSuspendedNotice({ to, name, planName, dueDate, daysOverdue = 10, interestCents = 0, dailyInterestPercent = 0 }) {
  const billingUrl = `${APP_URL}/billing`;
  const logoUrl = LOGO_URL;
  const niceDate = fmtDate(dueDate);
  const suspendedOn = fmtDate(new Date());
  const interestLine = interestCents > 0
    ? `<p style="color: #334155; font-size: 15px; line-height: 1.6;">Late interest of <b>${dailyInterestPercent}% per day</b> has accrued since ${niceDate} and now stands at <b>$${(interestCents / 100).toFixed(2)}</b>. It continues to accrue daily until the invoice is settled.</p>`
    : "";
  const interestText = interestCents > 0
    ? ` Late interest of ${dailyInterestPercent}% per day has accrued since ${niceDate} and now stands at $${(interestCents / 100).toFixed(2)}, continuing daily until settled.`
    : "";
  const subject = "Affiliar service suspended — pay to restore";

  const bodyHtml = `
    <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hi ${name || "there"},</p>
    <p style="color: #334155; font-size: 15px; line-height: 1.6;">Your Affiliar subscription${planName ? ` (${planName})` : ""} has been overdue since <b>${niceDate}</b> and is now <b>${daysOverdue} days past due</b>, so as of <b>${suspendedOn}</b> your operator panel is suspended.</p>
    <div style="background: #FEE2E2; border-left: 4px solid #B91C1C; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
      <p style="color: #7F1D1D; font-size: 14px; line-height: 1.5; margin: 0;"><b>From ${suspendedOn}, no further activity is recorded.</b> Clicks, registrations, deposits and player activity occurring while suspended are not captured, and that period cannot be reconstructed once service resumes — so commission for it cannot be calculated either.</p>
      <p style="color: #7F1D1D; font-size: 14px; line-height: 1.5; margin: 8px 0 0;">Everything recorded up to ${suspendedOn} is preserved. Paying restores access immediately, but only from the payment date onward.</p>
    </div>
    ${interestLine}
  `;
  const footerHtml = `<p style="color: #94A3B8; font-size: 12px; text-align: center;">Already paid? Provider confirmations can take a few minutes — access restores as soon as we receive the callback.</p>`;
  const htmlBody = billingShell({
    logoUrl, billingUrl,
    headline: "Service suspended — pay to restore",
    headlineColor: "#7F1D1D",
    bodyHtml,
    ctaLabel: "Pay now",
    ctaColor: "#7F1D1D",
    footerHtml,
  });
  const textBody = `Hi ${name || "there"},\n\nYour Affiliar subscription${planName ? ` (${planName})` : ""} has been overdue since ${niceDate} and is now ${daysOverdue} days past due, so as of ${suspendedOn} your operator panel is suspended.${interestText}\n\nFrom ${suspendedOn}, no further activity is recorded — clicks, registrations, deposits and player activity during suspension are not captured and cannot be reconstructed, so commission for that period cannot be calculated. Everything recorded up to ${suspendedOn} is preserved. Paying restores access immediately, but only from the payment date onward.\n\nPay now: ${billingUrl}`;

  return sendMail({ to, subject, htmlBody, textBody });
}

// Generic transactional email for an in-app notification (payout paid,
// commission approved, etc.). Mirrors the notification's title/body and links
// back into the app. Used by utils/notify.js when the recipient has email
// notifications enabled.
async function sendNotificationEmail({ to, name, title, body, link }) {
  const url = link ? `${APP_URL}${link}` : APP_URL;
  const subject = title || "Affiliar notification";
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px 30px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${LOGO_URL}" alt="Affiliar" width="160" style="display: inline-block;" />
      </div>
      <h2 style="color: #0F172A; margin-top: 0;">${title || "Notification"}</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hi ${name || "there"},</p>
      ${body ? `<p style="color: #334155; font-size: 15px; line-height: 1.6;">${body}</p>` : ""}
      <p style="margin: 32px 0; text-align: center;">
        <a href="${url}" style="background: #2563EB; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
          Open Affiliar
        </a>
      </p>
      <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 32px 0;" />
      <p style="color: #94A3B8; font-size: 12px; text-align: center;">You're receiving this because email notifications are on. Turn them off in your profile settings.</p>
    </div>
  `;
  const textBody = `Hi ${name || "there"},\n\n${title || "Notification"}${body ? `\n\n${body}` : ""}\n\nOpen Affiliar: ${url}`;
  return sendMail({ to, subject, htmlBody, textBody });
}

// Report digest email — operator or affiliate, weekly or monthly. `summary`/
// `prev` come from utils/reportDigest; `prev` gives WoW/MoM deltas; monthly runs
// pass `commissionCents` (operator = owed to affiliates, affiliate = earned).
async function sendReportDigest({
  audience = "operator", cadence = "weekly", to, name, operatorName,
  periodLabel, summary, prev, commissionCents = null,
}) {
  const isAff = audience === "affiliate";
  const link = isAff ? "/affiliate/reports" : "/reports";
  const reportsUrl = `${APP_URL}${link}`;
  const usd = (c) => `$${Math.round((Number(c) || 0) / 100).toLocaleString("en-US")}`;
  const num = (v) => (Number(v) || 0).toLocaleString("en-US");
  const delta = (cur, prv) => {
    if (!prv) return "";
    const d = ((cur - prv) / prv) * 100;
    if (!isFinite(d) || Math.abs(d) < 0.5) return "";
    const up = d >= 0;
    return ` <span style="color:${up ? "#16a34a" : "#dc2626"};font-size:12px;font-weight:600;">${up ? "▲" : "▼"} ${Math.abs(d).toFixed(0)}%</span>`;
  };
  const row = (label, valueHtml, highlight) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #F1F5F9;color:${highlight ? "#6D28D9" : "#64748B"};font-size:14px;font-weight:${highlight ? 700 : 400};">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #F1F5F9;color:${highlight ? "#6D28D9" : "#0F172A"};font-size:15px;font-weight:700;text-align:right;">${valueHtml}</td>
    </tr>`;
  const p = prev || {};

  const commissionRow = commissionCents != null
    ? row(isAff ? "Your commission earned" : "Commission owed to affiliates", usd(commissionCents), true)
    : "";

  const topHtml = !isAff && summary.topAffiliates && summary.topAffiliates.length
    ? `<p style="color:#334155;font-size:14px;font-weight:700;margin:24px 0 8px;">Top affiliates (by NGR)</p>
       <table style="width:100%;border-collapse:collapse;">
         ${summary.topAffiliates.map((a, i) => `
           <tr>
             <td style="padding:6px 0;color:#334155;font-size:14px;">${i + 1}. <b>${a.code}</b></td>
             <td style="padding:6px 0;color:#0F172A;font-size:14px;text-align:right;">${usd(a.ngrCents)} · ${num(a.ftdCount)} FTD</td>
           </tr>`).join("")}
       </table>`
    : "";

  const cadenceCap = cadence === "monthly" ? "Monthly" : "Weekly";
  const intro = isAff
    ? `Hi ${name || "there"}, here's your ${cadence} performance${operatorName ? ` with ${operatorName}` : ""} over <b>${periodLabel}</b>.`
    : `Hi ${name || "there"}, here's how ${operatorName || "your program"} did over <b>${periodLabel}</b>.`;
  const subject = `Your ${cadence} Affiliar report — ${periodLabel}`;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px 30px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${LOGO_URL}" alt="Affiliar" width="160" style="display: inline-block;" />
      </div>
      <h2 style="color:#6D28D9; margin-top:0;">Your ${cadence} report</h2>
      <p style="color:#334155;font-size:15px;line-height:1.6;">${intro}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        ${commissionRow}
        ${row("NGR", `${usd(summary.ngrCents)}${delta(summary.ngrCents, p.ngrCents)}`)}
        ${row("GGR", usd(summary.ggrCents))}
        ${row("Deposits", `${usd(summary.depositsSumCents)}${delta(summary.depositsSumCents, p.depositsSumCents)}`)}
        ${row("First-time deposits", `${num(summary.ftdCount)}${delta(summary.ftdCount, p.ftdCount)} · ${usd(summary.ftdSumCents)}`)}
        ${row("Registrations", `${num(summary.registrations)}${delta(summary.registrations, p.registrations)}`)}
        ${row("Active players", `${num(summary.activePlayers)}${delta(summary.activePlayers, p.activePlayers)}`)}
      </table>
      ${topHtml}
      <p style="margin:32px 0;text-align:center;">
        <a href="${reportsUrl}" style="background:#6D28D9;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block;">Open full reports</a>
      </p>
      <hr style="border:none;border-top:1px solid #E2E8F0;margin:32px 0;" />
      <p style="color:#94A3B8;font-size:12px;text-align:center;">You're receiving your ${cadence} Affiliar digest. Change the cadence or turn it off in your profile settings.</p>
    </div>`;

  const textBody =
    `Your ${cadenceCap} Affiliar report — ${periodLabel}\n\n` +
    (commissionCents != null ? `${isAff ? "Commission earned" : "Commission owed"}: ${usd(commissionCents)}\n` : "") +
    `NGR: ${usd(summary.ngrCents)}\nGGR: ${usd(summary.ggrCents)}\nDeposits: ${usd(summary.depositsSumCents)}\n` +
    `FTDs: ${num(summary.ftdCount)} (${usd(summary.ftdSumCents)})\nRegistrations: ${num(summary.registrations)}\n` +
    `Active players: ${num(summary.activePlayers)}\n\nFull reports: ${reportsUrl}`;

  return sendMail({ to, subject, htmlBody, textBody });
}

module.exports = {
  sendMail,
  sendNotificationEmail,
  sendReportDigest,
  sendAffiliateInvite,
  sendOperatorInvite,
  sendPasswordReset,
  sendBillingPastDue,             // legacy single transition email (kept for safety)
  sendBillingUpcoming,            // -7d / -3d
  sendBillingDueToday,            // 0d (trial end / monthly due)
  sendBillingPastDueReminder,     // +2d / +4d
  sendBillingSuspendedNotice,     // +7d, after the hard cut-off flip
};
