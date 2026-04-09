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
  const subject = `${operatorName || "Affiliar"} invited you to join their affiliate program`;
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>You're invited!</h2>
      <p>Hi ${name || "there"},</p>
      <p>${operatorName || "An operator"} has invited you to join their affiliate program on Affiliar.</p>
      <p>Click the button below to set your password and activate your account:</p>
      <p style="margin: 30px 0;">
        <a href="${activateUrl}"
           style="background: linear-gradient(135deg, #2563EB, #38BDF8); color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Activate Account
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">Or copy this link into your browser:<br/>
      <a href="${activateUrl}">${activateUrl}</a></p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">If you didn't expect this email, you can safely ignore it.</p>
    </div>
  `;
  const textBody = `Hi ${name || "there"},\n\n${operatorName || "An operator"} has invited you to join their affiliate program on Affiliar.\n\nActivate your account:\n${activateUrl}\n\nIf you didn't expect this email, you can safely ignore it.`;

  return sendMail({ to, subject, htmlBody, textBody });
}

module.exports = { sendMail, sendAffiliateInvite };
