const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authorize = require("../middlewares/auth");
/**
 * @swagger
 * /auth/dev-token:
 *   post:
 *     summary: Issue a development token (bypasses 2FA) for Swagger testing
 *     description: Enabled only when NODE_ENV != production or ENABLE_DEV_TOKEN=true.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               adminId:
 *                 type: string
 *                 description: Admin user's MongoDB _id
 *                 example: "67232725a5ac7041db6d9a4a"
 *               email:
 *                 type: string
 *                 description: Admin user's email (alternative to adminId)
 *                 example: "adminemail@gmail.com"
 *     responses:
 *       200:
 *         description: Returns a JWT for testing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *       400:
 *         description: Missing adminId or email
 *       403:
 *         description: Disabled in production
 *       404:
 *         description: Admin user not found
 */
router.post("/affiliate-register", authController.affiliateRegister);
router.post("/activate", authController.activate);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/dev-token", authController.devToken);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: User logged in successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", authController.login);

/**
 * @swagger
 * /auth/verify-2fa:
 *   post:
 *     summary: Verify 2FA code and receive JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: Admin user ID returned from /auth/login
 *                 example: "60d0fe4f5311236168a109ca"
 *               token:
 *                 type: string
 *                 description: 2FA one-time password from authenticator app
 *                 example: "123456"
 *               setupComplete:
 *                 type: boolean
 *                 description: Mark 2FA setup as complete (first-time setup)
 *                 example: true
 *     responses:
 *       200:
 *         description: 2FA verified successfully; JWT token returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 auth:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *       400:
 *         description: Invalid user or 2FA not set up
 *       401:
 *         description: Invalid OTP code
 */
router.post("/verify-2fa", authController.verifyTwoFactor);

/**
 * @swagger
 * /auth/generate-2fa-qr:
 *   get:
 *     summary: Generate QR code for setting up 2FA
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin user ID returned from /auth/login
 *         example: "60d0fe4f5311236168a109ca"
 *     responses:
 *       200:
 *         description: Returns QR code image (data URL) and secret
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 qrCodeImage:
 *                   type: string
 *                 secret:
 *                   type: string
 *       400:
 *         description: Invalid request for QR code generation
 */
router.get("/generate-2fa-qr", authController.generateTwoFactorQr);

/**
 * @swagger
 * /auth/refresh:
 *   get:
 *     summary: Refresh authentication token
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   example: "newlyGeneratedJWTToken"
 *       401:
 *         description: Invalid or expired token
 */
router.get("/refresh", authController.refresh);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout a user
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: User logged out successfully
 *       401:
 *         description: Unauthorized or session not found
 */

router.post("/logout", authController.logout);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change password for the authenticated admin
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: OldPassword123
 *               newPassword:
 *                 type: string
 *                 example: NewPassword123
 *               confirmNewPassword:
 *                 type: string
 *                 example: NewPassword123
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error (mismatch or invalid format)
 *       401:
 *         description: Unauthorized or current password incorrect
 *       404:
 *         description: User not found
 */
router.post("/change-password", authorize(), authController.changePassword);

/**
 * @swagger
 * /auth/update-profile:
 *   put:
 *     summary: Update profile fields for the authenticated admin
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jane Admin
 *               mobileNumber:
 *                 type: string
 *                 example: "+491711234567"
 *               mobileCountryCode:
 *                 type: string
 *                 example: "DE"
 *     responses:
 *       200:
 *         description: Profile updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     mobileNumber:
 *                       type: string
 *                     mobileCountryCode:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Update failed
 */
router.put("/update-profile", authorize(), authController.updateProfile);

module.exports = router;
