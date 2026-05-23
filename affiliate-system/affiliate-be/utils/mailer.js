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
  const logoUrl = `${APP_URL}/affiliar-logo-email.svg`;
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

async function sendPasswordReset({ to, name, token }) {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
  const logoUrl = `${APP_URL}/affiliar-logo-email.svg`;
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
  const logoUrl = `${APP_URL}/affiliar-logo-email.svg`;
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

module.exports = { sendMail, sendAffiliateInvite, sendPasswordReset, sendBillingPastDue };
