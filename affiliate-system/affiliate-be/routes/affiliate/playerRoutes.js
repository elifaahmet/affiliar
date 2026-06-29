const express = require("express");
const router = express.Router();
const { check } = require("express-validator");
const validate = require("../../middlewares/validation");
const { body } = require("express-validator");
const playerController = require("../../controllers/affiliate/playerController.js");
const affiliatePlayerController = require("../../controllers/affiliate/affiliatePlayerController.js");
const redisClient = require("../../redis/redisClient.js");
const authorize = require("../../middlewares/auth.js");
const { logger } = require("../../middlewares/logger");

// Affiliate-linked player listing (operator dashboard)
router.get("/", affiliatePlayerController.list);
router.get("/affiliates-select", affiliatePlayerController.affiliatesSelect);
router.get("/detail/:playerId", affiliatePlayerController.detail);
// Operator-only: pull player_id -> username from the casino. Must precede the
// parametric "/:adminId" POST route below.
router.post("/sync-names", affiliatePlayerController.syncNames);

/**
 * @swagger
 * tags:
 *   name: Players
 *   description: Player management and wallets
 */

/**
 * @swagger
 * /players/list/simple/{adminId}:
 *   get:
 *     summary: Get players with username, numeric id, and object id for tooling
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: adminId
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin identifier
 *     responses:
 *       200:
 *         description: A list of simplified player objects
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 players:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       id:
 *                         type: integer
 *                       username:
 *                         type: string
 */
router.get("/list/simple/:adminId", playerController.getSimplePlayerList);

/**
 * @swagger
 * /players:
 *   get:
 *     summary: Get all Players
 *     tags: [Players]
 *     responses:
 *       200:
 *         description: A list of players
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Player'
 */
router.get("/:adminId", playerController.getAllPlayers);

/**
 * @swagger
 * /players:
 *   post:
 *     summary: Create a new player
 *     tags: [Players]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Player'
 *     responses:
 *       201:
 *         description: Player created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Player'
 *       400:
 *         description: Bad request
 */

router.post("/:adminId", playerController.create);

/**
 * @swagger
 * /players/getById/{id}:
 *   get:
 *     summary: Get an player user by  generated ID
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The player user ID
 *     responses:
 *       200:
 *         description: An player user object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Player'
 *       404:
 *         description: Player user not found
 */
router.get("/getById/:id/:adminId", playerController.getByGeneratedId);

/**
 * @swagger
 * /players/filter:
 *   get:
 *     summary: Filter Players
 *     tags: [Players]
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         description: Filter by player ID
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         description: Filter by player email
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by country ID
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: Filter by city
 *       - in: query
 *         name: dateOfBirth
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date of birth in yyyy-MM-dd format
 *       - in: query
 *         name: dateOfBirthComp
 *         schema:
 *           type: string
 *           enum: [eq, lt, gt, lte, gte]
 *         description: Comparison operator for dateOfBirth
 *       - in: query
 *         name: gender
 *         schema:
 *           type: string
 *         description: Filter by gender
 *       - in: query
 *         name: registrationDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by registration date in yyyy-MM-dd format
 *       - in: query
 *         name: registrationDateComp
 *         schema:
 *           type: string
 *           enum: [eq, lt, gt, lte, gte]
 *         description: Comparison operator for registrationDate
 *       - in: query
 *         name: lastLogin
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by last login date in yyyy-MM-dd format
 *       - in: query
 *         name: lastLoginComp
 *         schema:
 *           type: string
 *           enum: [eq, lt, gt, lte, gte]
 *         description: Comparison operator for lastLogin
 *       - in: query
 *         name: isValidated
 *         schema:
 *           type: boolean
 *         description: Filter by validation status
 *       - in: query
 *         name: isRegistered
 *         schema:
 *           type: boolean
 *         description: Filter by registration status
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Filter by language ID
 *       - in: query
 *         name: mobile
 *         schema:
 *           type: string
 *         description: Filter by mobile number
 *       - in: query
 *         name: zip
 *         schema:
 *           type: string
 *         description: Filter by postal code
 *       - in: query
 *         name: marketingCode
 *         schema:
 *           type: string
 *         description: Filter by marketing code ID
 *       - in: query
 *         name: revenueScheme
 *         schema:
 *           type: string
 *         description: Filter by revenue scheme ID
 *     responses:
 *       200:
 *         description: A list of filtered players
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Player'
 */
router.get("/filter/", playerController.filterPlayers);

/**
 * @swagger
 * /players/{id}:
 *   get:
 *     summary: Get an player user by ID
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The player user ID
 *     responses:
 *       200:
 *         description: An player user object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Player'
 *       404:
 *         description: Player user not found
 */
router.get(
  "/:id/:adminId",
  validate([
    check("id").isMongoId().withMessage("ID must be a valid MongoDB ObjectId"),
  ]),
  playerController.getById,
);

router.put(
  "/:id/change-password",
  authorize(["players.list.detail.info.changePassword.edit"]),
  playerController.changePlayerPassword,
);

/**
 * @swagger
 * /players/{id}/change-password:
 *   put:
 *     summary: Change a player's password
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Player MongoDB ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 example: NewStrongP@ssw0rd
 *               confirmPassword:
 *                 type: string
 *                 example: NewStrongP@ssw0rd
 *             required: [password, confirmPassword]
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password updated successfully
 *       400:
 *         description: Validation error (missing fields or mismatch)
 *       404:
 *         description: Player not found
 *       500:
 *         description: Internal Server Error
 */

/**
 * @swagger
 * /players/{id}:
 *   put:
 *     summary: Update a player by ID
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The player ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Player'
 *     responses:
 *       200:
 *         description: Player updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Player'
 *       404:
 *         description: Player not found
 */
router.put(
  "/:id/:adminId",
  validate([
    check("id").isMongoId().withMessage("ID must be a valid MongoDB ObjectId"),
    body("email").optional().isEmail().withMessage("Must be a valid email"),
    body("username")
      .optional()
      .isString()
      .withMessage("Username must be a string"),
    body("wallet.total")
      .optional()
      .isNumeric()
      .withMessage("Wallet total must be a number"),
  ]),
  playerController.updatePlayer,
);

/**
 * @swagger
 * /players/{id}/block/{adminId}:
 *   patch:
 *     summary: Block a player from logging in
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Player MongoDB ObjectId
 *       - in: path
 *         name: adminId
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin identifier
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               blockReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Player blocked
 *       404:
 *         description: Player not found
 */
router.patch(
  "/:id/block/:adminId",
  validate([
    check("id").isMongoId().withMessage("ID must be a valid MongoDB ObjectId"),
    check("adminId")
      .isMongoId()
      .withMessage("adminId must be a valid MongoDB ObjectId"),
    body("blockReason")
      .optional()
      .isString()
      .withMessage("blockReason must be a string"),
  ]),
  playerController.blockPlayer,
);

/**
 * @swagger
 * /players/{id}/unblock/{adminId}:
 *   patch:
 *     summary: Unblock a player and allow login
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Player MongoDB ObjectId
 *       - in: path
 *         name: adminId
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin identifier
 *     responses:
 *       200:
 *         description: Player unblocked
 *       404:
 *         description: Player not found
 */
router.patch(
  "/:id/unblock/:adminId",
  validate([
    check("id").isMongoId().withMessage("ID must be a valid MongoDB ObjectId"),
    check("adminId")
      .isMongoId()
      .withMessage("adminId must be a valid MongoDB ObjectId"),
  ]),
  playerController.unblockPlayer,
);

// GET /players/players/:id/online-status
router.get("/socket/:id/online-status", async (req, res) => {
  const playerId = req.params.id;
  logger.debug("players.socket.status.lookup", { playerId });

  const key = `online:player:${playerId}`;
  const isOnline = await redisClient.exists(key);

  res.json({ success: true, playerId, online: isOnline === 1 });
});

/**
 * @swagger
 * /players/socket/{id}/online-status:
 *   get:
 *     summary: Get player's online status
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Player MongoDB ObjectId or numeric ID used for socket key
 *     responses:
 *       200:
 *         description: Online status for the player
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 playerId:
 *                   type: string
 *                 online:
 *                   type: boolean
 *       500:
 *         description: Internal Server Error
 */

module.exports = router;
