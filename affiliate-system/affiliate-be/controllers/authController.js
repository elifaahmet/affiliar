const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const User = require("../models/User");
const Role = require("../models/Role");
const Operator = require("../models/Operator");
const AffiliateProfile = require("../models/AffiliateProfile");
const PasswordResetToken = require("../models/PasswordResetToken");
const { sendPasswordReset } = require("../utils/mailer");

const findUserByCredential = async (identifier) => {
  return User.findOne({
    $or: [{ email: identifier }, { username: identifier }],
    isDeleted: false,
  });
};

const findUserById = async (id) => {
  return User.findById(id).catch(() => null);
};
const { PASSWORD_REGEX } = require("../utils/constants");
const { MSG } = require("../middlewares/log-messages");
const SECRET_KEY = "your_secret_key";
const { logger } = require("../middlewares/logger");

const DEFAULT_BRAND_NAME = "Pixupplay";
const BRAND_NAME = (() => {
  const rawName = process.env.MONGODB_MAIN_DB_NAME;
  if (typeof rawName !== "string" || !rawName.trim()) {
    return DEFAULT_BRAND_NAME;
  }

  const sanitized = rawName.trim().replace(/[-_]?db$/i, "");
  return sanitized || DEFAULT_BRAND_NAME;
})();

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  const headerValue = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0];
  const rawIp =
    (typeof headerValue === "string" ? headerValue.trim() : "") ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    "";
  return rawIp.startsWith("::ffff:") ? rawIp.slice(7) : rawIp;
};

const groupPermissions = (permissions = []) => {
  return permissions.reduce((acc, perm) => {
    // Eğer sadece "players.list.view" gibi string geliyorsa
    if (typeof perm === "string") {
      const [resource, action] = perm.split(/\.(?=[^.]+$)/); // son noktadan ayır
      const category = resource.split(".")[0]; // "players.list" -> "players"
      let group = acc.find((g) => g.category === category);
      if (!group) {
        group = { category, rules: [] };
        acc.push(group);
      }
      group.rules.push({
        resource,
        action,
        condition: true,
      });
    }

    // Eğer obje olarak geliyorsa (zaten doğru formatta)
    else if (typeof perm === "object" && perm.resource && perm.action) {
      const category = perm.category || perm.resource.split(".")[0];
      let group = acc.find((g) => g.category === category);
      if (!group) {
        group = { category, rules: [] };
        acc.push(group);
      }
      group.rules.push({
        resource: perm.resource,
        action: perm.action,
        condition: perm.condition ?? true,
      });
    }

    return acc;
  }, []);
};

exports.login = async (req, res) => {
  const { identifier: rawId, password: rawPw } = req.body;
  const identifier = (rawId || "").trim();
  const password = (rawPw || "").trim();
  try {
    const player = await findUserByCredential(identifier);
    if (!player) {
      return res
        .status(401)
        .json({ auth: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, player.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    return res.status(200).json({
      auth: false,
      message: player.twoFactorEnabled ? "OTP required" : "2FA setup required",
      twoFactorRequired: true,
      userId: player._id,
      email: player.email,
      showQrCode: !player.twoFactorEnabled,
    });
  } catch (error) {
    req.logMsg(MSG.AUTH_LOGIN_ERROR, { error_message: error.message }, "error");
    return res.status(500).json({ message: "An error occurred during login" });
  }
};

exports.refresh = async (req, res) => {
  const token = req.cookies.token;
  const { adminId } = req.query;

  if (!token) {
    return res.status(401).json({ auth: false, message: "Token is missing" });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const clientIP = getClientIp(req);

    if (decoded.exp * 1000 < Date.now()) {
      res.clearCookie("token");
      return res.status(401).json({ auth: false, message: "Token expired" });
    }

    if (decoded.ip !== clientIP) {
      res.clearCookie("token");
      return res
        .status(401)
        .json({ auth: false, message: "IP address mismatch" });
    }

    if (decoded.sub !== adminId) {
      res.clearCookie("token");
      return res
        .status(401)
        .json({ auth: false, message: "Admin ID mismatch" });
    }

    const user = await findUserById(adminId);
    if (!user) {
      return res.status(404).json({ auth: false, message: "User not found" });
    }

    let role = await Role.findOne({ roleName: user.role });
    if (!role) {
      logger.warn("auth.refresh.role_missing", {
        userId: user._id,
        role: user.role,
      });
    }

    return res.status(200).json({
      auth: true,
      message: "Token is still valid",
      user: {
        email: user.email,
        role: role?.roleName || user.role,
        isPlatformAdmin: !!user.isPlatformAdmin,
        permissions: groupPermissions(role?.permissions || []),
        name: user.name || null,
        mobileNumber: user.mobileNumber || null,
        mobileCountryCode: user.mobileCountryCode || null,
      },
    });
  } catch (error) {
    res.clearCookie("token");
    req.logMsg(
      MSG.AUTH_REFRESH_INVALID,
      { error_message: error.message },
      "error",
    );
    return res.status(401).json({ auth: false, message: "Invalid token" });
  }
};

exports.generateTwoFactorQr = async (req, res) => {
  const { userId } = req.query;

  try {
    const user = await findUserById(userId);

    if (!user || user.twoFactorEnabled) {
      return res
        .status(400)
        .json({ message: "Invalid request for QR code generation." });
    }

    if (!user.twoFactorSecret) {
      const secret = speakeasy.generateSecret({
        length: 20,
        name: `${BRAND_NAME} (${user.email})`,
      });

      user.twoFactorSecret = secret.base32.trim();
      user.twoFactorEnabled = false;
      user.twoFactorQrScanned = false;
      await user.save();
    }

    const otpauthUrl = speakeasy.otpauthURL({
      secret: user.twoFactorSecret,
      label: `${BRAND_NAME} (${user.email})`,
      encoding: "base32",
    });

    const qrCodeImage = await qrcode.toDataURL(otpauthUrl);

    return res.status(200).json({
      qrCodeImage,
      secret: user.twoFactorSecret,
    });
  } catch (error) {
    req.logMsg(
      MSG.AUTH_2FA_QR_ERROR,
      { error_message: error.message, user_id: userId },
      "error",
    );
    return res.status(500).json({ message: "Error generating QR code" });
  }
};

exports.verifyTwoFactor = async (req, res) => {
  const { userId, token: otpCode, setupComplete } = req.body;

  try {
    const user = await findUserById(userId);

    if (!user || !user.twoFactorSecret) {
      return res
        .status(400)
        .json({ auth: false, message: "Invalid user or 2FA not set up." });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: otpCode,
      window: 1,
    });

    if (!verified) {
      return res
        .status(401)
        .json({ auth: false, message: "Invalid OTP code." });
    }

    const clientIP = getClientIp(req);
    const country = req.headers["cf-ipcountry"] || "unknown";

    if (setupComplete && !user.twoFactorQrScanned) {
      user.twoFactorEnabled = true;
      user.twoFactorQrScanned = true;
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      {
        sub: user._id,
        ip: clientIP,
        country,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      },
      SECRET_KEY,
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
    });

    let role = await Role.findOne({ roleName: user.role });
    if (!role) {
      logger.warn("auth.totp.role_missing", {
        userId: user._id,
        role: user.role,
      });
    }

    return res.status(200).json({
      auth: true,
      message: "Login successful with 2FA",
      token,
      user: {
        email: user.email,
        role: role?.roleName || user.role,
        isPlatformAdmin: !!user.isPlatformAdmin,
        permissions: groupPermissions(role?.permissions || []),
        name: user.name || null,
        mobileNumber: user.mobileNumber || null,
        mobileCountryCode: user.mobileCountryCode || null,
      },
    });
  } catch (error) {
    req.logMsg(
      MSG.AUTH_2FA_ERROR,
      { error_message: error.message, user_id: userId },
      "error",
    );
    return res
      .status(500)
      .json({ message: "An error occurred during 2FA verification" });
  }
};

exports.changePassword = async (req, res) => {
  const userId = req.user.sub;
  const { currentPassword, newPassword, confirmNewPassword } = req.body || {};

  const current =
    typeof currentPassword === "string" ? currentPassword.trim() : "";
  const next = typeof newPassword === "string" ? newPassword.trim() : "";
  const confirm =
    typeof confirmNewPassword === "string" ? confirmNewPassword.trim() : "";

  const errors = [];

  if (!current || !next || !confirm) {
    errors.push("All password fields are required");
  }

  if (next !== confirm) {
    errors.push("New password and confirmation do not match");
  }

  if (next && !PASSWORD_REGEX.test(next)) {
    errors.push(
      "Password must be 8-25 characters, contain at least 1 letter and 1 number",
    );
  }

  if (errors.length) {
    return res.status(400).json({ errors });
  }

  try {
    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(current, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const isSameAsExisting = await bcrypt.compare(next, user.password);
    if (isSameAsExisting) {
      return res
        .status(400)
        .json({ message: "New password must be different from current" });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(next, salt);
    await user.save();

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    req.logMsg(
      MSG.AUTH_PASSWORD_CHANGE_ERROR,
      { user_id: userId, error_message: error.message },
      "error",
    );
    return res
      .status(500)
      .json({ message: "An error occurred while changing the password" });
  }
};

exports.updateProfile = async (req, res) => {
  const userId = req.user.sub;
  const { name, mobileNumber, mobileCountryCode } = req.body;

  try {
    const user = await findUserById(userId);
    if (user) {
      if (name) user.name = name.trim();
      if (mobileNumber) user.mobileNumber = mobileNumber.trim();
      if (mobileCountryCode) user.mobileCountryCode = mobileCountryCode.trim();
      await user.save();
    }
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Profile updated",
      user: {
        name: user.name,
        mobileNumber: user.mobileNumber,
        mobileCountryCode: user.mobileCountryCode,
      },
    });
  } catch (error) {
    req.logMsg(
      MSG.AUTH_PROFILE_UPDATE_ERROR,
      { user_id: userId, error_message: error.message },
      "error",
    );
    res.status(500).json({ message: "Update failed" });
  }
};

exports.logout = async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
  });
  req.logMsg(MSG.AUTH_LOGOUT_OK, { user_id: req.user?.sub });
  return res
    .status(200)
    .json({ auth: false, message: "Logged out successfully" });
};

function generateAffiliateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

exports.affiliateRegister = async (req, res) => {
  try {
    const { operatorId, email, username, name, password, mobileNumber, mobileCountryCode, parentCode } = req.body;

    if (!email || !username || !name || !password) {
      return res.status(400).json({ error: "email, username, name and password are required" });
    }
    if (!operatorId && !parentCode) {
      return res.status(400).json({ error: "operatorId or parentCode is required" });
    }

    // Resolve operator: either directly from operatorId, or via parent affiliate's operatorUser
    let operator = null;
    if (operatorId) {
      operator = await Operator.findById(operatorId);
      if (!operator) {
        return res.status(400).json({ error: "Invalid invite link — operator not found" });
      }
    }

    // Resolve parent affiliate from parentCode — must happen before User.create
    let parentAffiliateId = null;
    let parentOperatorUser = null;
    let inheritedBrandId = null;
    if (parentCode) {
      const parentProfile = await AffiliateProfile.findOne({
        referralCodes: parentCode,
      }).lean();
      if (!parentProfile) {
        return res.status(400).json({ error: "Invalid parentCode — referral code not found" });
      }
      parentAffiliateId  = parentProfile.user;
      parentOperatorUser = parentProfile.operatorUser;

      // The recruit link the parent shared is brand-scoped iff that code
      // appears in their brandCodes entries — pull the brand context off
      // the specific code so the new sub starts with a real brand mapping
      // instead of the legacy null-brand fallback.
      const matchedBrand = (parentProfile.brandCodes || [])
        .find((bc) => bc.code === parentCode);
      if (matchedBrand?.brandId) {
        inheritedBrandId = matchedBrand.brandId;
      }

      // Derive operator from parent's operatorUser
      if (!operator && parentOperatorUser) {
        const parentUser = await User.findById(parentOperatorUser).lean();
        if (parentUser?.operatorId) {
          operator = await Operator.findById(parentUser.operatorId);
        }
        if (!operator) {
          operator = await Operator.findById(parentOperatorUser);
        }
      }
    }

    if (!operator) {
      return res.status(400).json({ error: "Could not resolve operator from invite link" });
    }

    const existing = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }],
      isDeleted: false,
    });
    if (existing) {
      return res.status(409).json({ error: "Email or username already taken" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      email: email.toLowerCase(),
      username,
      name,
      password: hashed,
      role: "affiliate",
      status: "active",
      operatorId: operator._id,
      mobileNumber: mobileNumber || null,
      mobileCountryCode: mobileCountryCode || null,
      isDeleted: false,
    });

    let affiliateCode;
    let attempts = 0;
    do {
      affiliateCode = generateAffiliateCode();
      attempts++;
    } while (
      (await AffiliateProfile.findOne({ "referralCodes": affiliateCode })) && attempts < 10
    );

    await AffiliateProfile.create({
      user: user._id,
      referralCodes: [affiliateCode],
      brandCodes: inheritedBrandId
        ? [{ code: affiliateCode, brandId: inheritedBrandId }]
        : [],
      operatorUser: parentOperatorUser ?? null,
      parentAffiliate: parentAffiliateId,
    });

    return res.status(201).json({
      message: "Affiliate registered successfully",
      affiliateCode,
      parentAffiliate: parentAffiliateId ?? null,
      user: { id: String(user._id), email: user.email, username: user.username },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /auth/activate
 * Affiliate sets their password for the first time (operator-created accounts).
 * Body: { userId, password }
 */
exports.activate = async (req, res) => {
  const { userId, password } = req.body;

  if (!userId || !password) {
    return res.status(400).json({ error: "userId and password are required" });
  }

  if (!PASSWORD_REGEX.test(password)) {
    return res.status(400).json({
      error: "Password must be 8-25 characters, contain at least 1 letter and 1 number",
    });
  }

  try {
    const user = await findUserById(userId);
    if (!user || user.isDeleted) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user.status !== "pending") {
      return res.status(400).json({ error: "Account is already activated" });
    }

    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    user.status = "active";
    await user.save();

    return res.status(200).json({ message: "Account activated successfully. You can now sign in." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// DEV/TEST ONLY: Issue a JWT without 2FA to test Swagger
exports.devToken = async (req, res) => {
  try {
    // Allow only when not in production or explicitly enabled
    const enabled =
      process.env.NODE_ENV !== "production" ||
      String(process.env.ENABLE_DEV_TOKEN).toLowerCase() === "true";
    if (!enabled) {
      return res.status(403).json({ message: "Disabled in production" });
    }

    const { adminId, email } = req.body || {};
    if (!adminId && !email) {
      return res
        .status(400)
        .json({ message: "Provide adminId or email in request body" });
    }

    const user = adminId
      ? await findUserById(adminId)
      : await findUserByCredential(email);

    if (!user || user.isDeleted) {
      return res.status(404).json({ message: "Admin user not found" });
    }

    const clientIP =
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      "127.0.0.1";
    const country = req.headers["cf-ipcountry"] || "unknown";

    const token = jwt.sign(
      {
        sub: user._id,
        ip: clientIP,
        country,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      },
      SECRET_KEY,
    );

    return res.status(200).json({
      message: "Development token issued",
      token,
      user: { id: String(user._id), email: user.email, role: user.role },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to issue token" });
  }
};

/**
 * POST /auth/forgot-password
 * Body: { email }
 * Always returns 200 to prevent email enumeration.
 */
exports.forgotPassword = async (req, res) => {
  const email = ((req.body.email || "") + "").trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  try {
    const user = await User.findOne({ email, isDeleted: false });
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await PasswordResetToken.create({
        userId: user._id,
        token,
        expiresAt,
      });

      try {
        await sendPasswordReset({
          to: user.email,
          name: user.name,
          token,
        });
      } catch (mailErr) {
        // eslint-disable-next-line no-console
        console.error("auth.forgot.mail_failed", mailErr.message);
      }
    }

    return res.status(200).json({
      message: "If an account exists for that email, a reset link has been sent.",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /auth/reset-password
 * Body: { token, password }
 */
exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: "token and password are required" });
  }
  if (!PASSWORD_REGEX.test(password)) {
    return res.status(400).json({
      error: "Password must be 8-25 characters, contain at least 1 letter and 1 number",
    });
  }

  try {
    const record = await PasswordResetToken.findOne({ token });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const user = await findUserById(record.userId);
    if (!user || user.isDeleted) {
      return res.status(404).json({ error: "User not found" });
    }

    user.password = await bcrypt.hash(password, 10);
    if (user.status === "pending") user.status = "active";
    await user.save();

    record.usedAt = new Date();
    await record.save();

    return res.status(200).json({ message: "Password updated. You can now sign in." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
