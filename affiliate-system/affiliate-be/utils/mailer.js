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

module.exports = { sendMail, sendAffiliateInvite };
