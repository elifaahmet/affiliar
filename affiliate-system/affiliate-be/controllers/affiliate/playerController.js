const { default: mongoose } = require("mongoose");
const Player = require("../../models/Player");
const bcrypt = require("bcryptjs");
const getNextSequence = require("../../middlewares/counterAdder");
const { buildDateRange } = require("../../utils/dateRange");
const speakeasy = require("speakeasy");
const { MSG } = require("../../middlewares/log-messages");
const { logger } = require("../../middlewares/logger");
const { publishPlayerForceLogout } = require("../../redis/dashboardService");

const getAffiliateFilter = (req) => {
  const affiliateId = req?.adminUser?._id;
  if (!affiliateId) return null;
  return { affiliateAdminUserId: affiliateId };
};

const buildDateRangeFilter = (start, end, inclusiveEnd = true, tz) => {
  const { start: s, end: e, error } = buildDateRange({
    startDate: start,
    endDate: end,
    tz,
  });
  if (error) return { error };
  if (!s && !e) return { filter: null };
  if (e && !inclusiveEnd) {
    e.setHours(0, 0, 0, 0);
  }
  const filter = {};
  if (s) filter.$gte = s;
  if (e) filter.$lte = e;
  return { filter };
};

const toNumberSafe = (value) => {
  if (value instanceof mongoose.Types.Decimal128) {
    const parsed = parseFloat(value.toString());
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (value && typeof value === "object" && value.$numberDecimal) {
    const parsed = parseFloat(value.$numberDecimal);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const normalizeGameCategories = (gameCategories) => {
  if (typeof gameCategories === "string") {
    return gameCategories
      .split(",")
      .map((category) => category.trim())
      .filter(Boolean);
  }
  if (Array.isArray(gameCategories)) {
    return gameCategories
      .map((category) => String(category).trim())
      .filter(Boolean);
  }
  return [];
};

const buildAcquisitionSourceLabelProjection = () => ({
  $switch: {
    branches: [
      {
        case: { $eq: ["$acquisitionSourceType", "admin_affiliate"] },
        then: "Admin Affiliate",
      },
      {
        case: { $eq: ["$acquisitionSourceType", "player_referral"] },
        then: "Player Referral",
      },
    ],
    default: "Direct",
  },
});
const playerController = {
  getAllPlayers: async (req, res) => {
    try {
      const { exportType } = req.query;
      const rawPage = req.query.page;
      const rawLimit = req.query.limit;
      const page = rawPage ?? 1;
      const limit = rawLimit ?? 50;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const exportTypeNorm =
        typeof exportType === "string" ? exportType.toLowerCase() : "";
      const isFullExport = exportTypeNorm === "full";
      const isExportRequest = exportTypeNorm !== "";

      const filters = { isDeleted: false, isActive: true };
      const affiliateFilter = getAffiliateFilter(req);
      if (affiliateFilter) {
        Object.assign(filters, affiliateFilter);
      }
      const sourceTypeRaw = Array.isArray(req.query.sourceType)
        ? req.query.sourceType[0]
        : req.query.sourceType;
      if (typeof sourceTypeRaw === "string" && sourceTypeRaw.trim()) {
        const sourceType = sourceTypeRaw.trim().toLowerCase();
        if (sourceType === "admin_affiliate" || sourceType === "player_referral") {
          filters.acquisitionSourceType = sourceType;
        } else if (sourceType === "direct") {
          filters.acquisitionSourceType = null;
        }
      }
      const MAIN_CURRENCY_CODE = process.env.APP_MAIN_CURRENCY.toUpperCase();
      const sortByBalanceValue = Array.isArray(req.query.sortByBalance)
        ? req.query.sortByBalance[0]
        : req.query.sortByBalance;

      const buildSortByBalanceStage = (value) => {
        if (value === "balance_desc") {
          return { totalBalance: -1, createdAt: -1 };
        }
        if (value === "balance_asc") {
          return { totalBalance: 1, createdAt: -1 };
        }
        return { createdAt: -1 };
      };

      // these will be matched later after casting id to string
      const textFilters = {};
      if (!isFullExport) {
        if (req.query.id) {
          textFilters.idStr = { $regex: req.query.id, $options: "i" };
        }
        if (req.query.email) {
          textFilters.email = { $regex: req.query.email, $options: "i" };
        }
        if (req.query.username) {
          textFilters.username = { $regex: req.query.username, $options: "i" };
        }

        if (req.query.country) {
          try {
            filters["verify1.countryName"] = {
              $regex: req.query.country,
              $options: "i",
            };
          } catch (err) {
            return res.status(400).json({ message: "Invalid country ID format" });
          }
        }
        if (req.query.city) {
          textFilters["verify1.cityId"] = {
            $regex: req.query.city,
            $options: "i",
          };
        }
        if (req.query.dateOfBirth) {
          const [dd, mm, yyyy] = req.query.dateOfBirth.split("-");

          const start = `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
          const end = `${yyyy}-${mm}-${dd}T23:59:59.999Z`;

          filters["verify1.birthDate"] = {
            $gte: start,
            $lte: end,
          };
        }
      const loginDateFilterRes = buildDateRangeFilter(
        req.query.startDate,
        req.query.endDate,
        true,
        req.query.tz,
      );
      if (loginDateFilterRes?.error) {
        return res.status(400).json({ message: loginDateFilterRes.error });
      }
      if (loginDateFilterRes?.filter) {
        filters.lastLogin = loginDateFilterRes.filter;
      }
        const registerEndDate = req.query.registerEndDate
          ? req.query.registerEndDate
          : req.query.registerStartDate;
      const registerDateFilterRes = buildDateRangeFilter(
        req.query.registerStartDate,
        registerEndDate,
        true,
        req.query.tz,
      );

      if (registerDateFilterRes?.error) {
        return res.status(400).json({ message: registerDateFilterRes.error });
      }
      if (registerDateFilterRes?.filter) {
        filters.createdAt = registerDateFilterRes.filter;
      }

        if (req.query.isValidated)
          filters.verifyLevel = Number(req.query.isValidated);
        if (req.query.mobileNumber)
          filters["verify1.mobileNumber"] = req.query.mobileNumber;
        if (req.query.mobileCountryCode)
          filters["verify1.mobileCountryCode"] = req.query.mobileCountryCode;
        if (typeof req.query.isBlocked !== "undefined") {
          if (req.query.isBlocked === "true") {
            filters.isBlocked = true;
          } else if (req.query.isBlocked === "false") {
            filters.$or = [
              { isBlocked: false },
              { isBlocked: { $exists: false } },
              { isBlocked: null },
            ];
          }
        }
      }
      const data = await Player.aggregate([
        { $match: filters },
        {
          $addFields: {
            idStr: { $toString: "$id" },
          },
        },
        {
          $match: textFilters,
        },
        {
          $lookup: {
            from: "wallets",
            localField: "_id",
            foreignField: "playerId",
            as: "wallets",
          },
        },
        {
          $unwind: { path: "$wallets", preserveNullAndEmptyArrays: true },
        },
        {
          $match: {
            $or: [
              { "wallets.walletCategory": { $ne: "Bonus" } },
              { wallets: { $eq: null } },
            ],
          },
        },
        {
          $lookup: {
            from: "currencies",
            localField: "wallets.currency",
            foreignField: "_id",
            as: "wallets.currency",
          },
        },
        {
          $unwind: {
            path: "$wallets.currency",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: "$_id",
            playerData: { $first: "$$ROOT" },
            wallets: {
              $push: {
                balance: "$wallets.total",
                walletCategory: "$wallets.walletCategory",
                currency: {
                  name: "$wallets.currency.name",
                  code: "$wallets.currency.code",
                  symbol: "$wallets.currency.symbol",
                  fixedValueCount: "$wallets.currency.fixedValueCount",
                },
              },
            },
          },
        },
        {
          $addFields: {
            "playerData.wallets": "$wallets",
          },
        },
        {
          $replaceRoot: { newRoot: "$playerData" },
        },
        {
          $addFields: {
            totalBalance: {
              $reduce: {
                input: {
                  $filter: {
                    input: { $ifNull: ["$wallets", []] },
                    as: "wallet",
                    cond: {
                      $eq: [
                        {
                          $toUpper: {
                            $ifNull: ["$$wallet.currency.code", ""],
                          },
                        },
                        MAIN_CURRENCY_CODE,
                      ],
                    },
                  },
                },
                initialValue: 0,
                in: {
                  $add: [
                    "$$value",
                    {
                      $ifNull: [{ $toDouble: "$$this.balance" }, 0],
                    },
                  ],
                },
              },
            },
          },
        },
        {
          $lookup: {
            from: "languages",
            localField: "languageId",
            foreignField: "_id",
            as: "language",
          },
        },
        {
          $lookup: {
            from: "countries",
            localField: "countryId",
            foreignField: "_id",
            as: "country",
          },
        },
        {
          $unwind: { path: "$language", preserveNullAndEmptyArrays: true },
        },
        {
          $unwind: { path: "$country", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "affiliateusers",
            localField: "blockedBy",
            foreignField: "_id",
            as: "blockedByAdmin",
          },
        },
        {
          $unwind: {
            path: "$blockedByAdmin",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            blockedByEmail: "$blockedByAdmin.email",
          },
        },
        {
          $lookup: {
            from: "casinoTransactionsV2",
            let: { playerId: "$id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$playerId", "$$playerId"] },
                },
              },
              {
                $group: {
                  _id: null,
                  totalBet: {
                    $sum: {
                      $cond: [{ $eq: ["$type", "bet"] }, "$amount", 0],
                    },
                  },
                  totalWin: {
                    $sum: {
                      $cond: [{ $eq: ["$type", "result"] }, "$amount", 0],
                    },
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  winRate: {
                    $cond: [
                      { $eq: ["$totalBet", 0] },
                      0,
                      {
                        $multiply: [
                          { $divide: ["$totalWin", "$totalBet"] },
                          100,
                        ],
                      },
                    ],
                  },
                },
              },
            ],
            as: "tendencyData",
          },
        },
        {
          $unwind: {
            path: "$tendencyData",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $sort: buildSortByBalanceStage(sortByBalanceValue),
        },
        {
          $addFields: {
            winningTendency: {
              $switch: {
                branches: [
                  {
                    case: { $gte: ["$tendencyData.winRate", 80] },
                    then: "Very High Tendency",
                  },
                  {
                    case: { $gte: ["$tendencyData.winRate", 60] },
                    then: "High Tendency",
                  },
                  {
                    case: { $gte: ["$tendencyData.winRate", 40] },
                    then: "Medium Tendency",
                  },
                ],
                default: "Low Tendency",
              },
            },
          },
        },
        // --- populate gamificationLevel -> { level, label } ---
        {
          $addFields: {
            _gamiId: {
              $cond: [
                { $eq: [{ $type: "$gamificationLevel" }, "objectId"] },
                "$gamificationLevel",
                "$$REMOVE",
              ],
            },
            _gamiNum: {
              $cond: [
                {
                  $in: [
                    { $type: "$gamificationLevel" },
                    ["int", "long", "double"],
                  ],
                },
                "$gamificationLevel",
                null,
              ],
            },
          },
        },
        {
          $lookup: {
            from: "gamificationLevels",
            let: { gid: "$_gamiId", gnum: "$_gamiNum" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $or: [
                      {
                        $and: [
                          { $ne: ["$$gid", undefined] },
                          { $eq: ["$_id", "$$gid"] },
                        ],
                      },
                      {
                        $and: [
                          { $ne: ["$$gnum", null] },
                          { $eq: ["$level", "$$gnum"] },
                        ],
                      },
                    ],
                  },
                },
              },

              { $project: { _id: 1, level: 1, label: 1, image: 1 } },
            ],
            as: "_gamiDoc",
          },
        },
        {
          $addFields: {
            gamificationLevel: {
              $let: {
                vars: { g: { $arrayElemAt: ["$_gamiDoc", 0] } },
                in: {
                  level: "$$g.level",
                  label: "$$g.label",
                  image: "$$g.image",
                },
              },
            },
          },
        },
        { $unset: ["_gamiId", "_gamiNum", "_gamiDoc"] },
        {
          $project: {
            wallets: 1,
            email: 1,
            id: 1,
            username: 1,
            mobileNumber: {
              $let: {
                vars: {
                  countryCode: { $ifNull: ["$verify1.mobileCountryCode", ""] },
                  number: { $ifNull: ["$verify1.mobileNumber", ""] },
                },
                in: {
                  $cond: [
                    {
                      $gt: [
                        {
                          $strLenCP: {
                            $trim: {
                              input: {
                                $concat: ["$$countryCode", " ", "$$number"],
                              },
                            },
                          },
                        },
                        0,
                      ],
                    },
                    {
                      $trim: {
                        input: {
                          $concat: ["$$countryCode", " ", "$$number"],
                        },
                      },
                    },
                    null,
                  ],
                },
              },
            },
            country: "$verify1.countryName",
            city: "$verify1.cityId",
            verifyLevel: 1,
            acquisitionSourceType: 1,
            acquisitionSourceLabel: buildAcquisitionSourceLabelProjection(),
            winningTendency: 1,
            lastLogin: 1,
            createdAt: 1,
            createdDateTime: {
              $cond: [
                { $ifNull: ["$createdAt", false] },
                {
                  $dateToString: {
                    format: "%Y-%m-%d %H:%M:%S",
                    date: "$createdAt",
                    timezone: req.query.tz || "UTC",
                  },
                },
                null,
              ],
            },
            gamificationLevel: 1,
            totalBalance: 1,
            isBlocked: 1,
          },
        },
        {
          $facet: {
            data: [
              ...(!isExportRequest ? [{ $skip: skip }, { $limit: parseInt(limit) }] : []),
            ],
            totalCount: [{ $count: "count" }],
          },
        },
      ]);

      const { data: players, totalCount } = data[0];

      if (!players || players.length === 0) {
        return res.status(404).json({ message: "Players not found" });
      }
      req.logMsg(MSG.PLAYER_GETALL_OK, { count: players.length });
      const response = {
        success: true,
        data: players,
        total: totalCount[0]?.count || 0,
      };
      if (!isExportRequest) {
        response.page = parseInt(page);
        response.limit = parseInt(limit);
      }
      res.json(response);
    } catch (error) {
      req.logMsg(MSG.PLAYER_GETALL_ERR, { error }, "error");
      res.status(500).json({ message: error.message });
    }
  },

  getSimplePlayerList: async (req, res) => {
    try {
      const affiliateFilter = getAffiliateFilter(req);
      const players = await Player.find(
        {
          isDeleted: false,
          isActive: true,
          ...(affiliateFilter || {}),
        },
        { username: 1, id: 1 },
      )
        .sort({ username: 1 })
        .lean();

      return res.status(200).json({ success: true, players });
    } catch (error) {
      req.logMsg?.(
        { ...MSG.PLAYER_SIMPLE_LIST_ERR, text: "Failed to fetch player list" },
        { error },
        "error",
      );
      return res
        .status(500)
        .json({ success: false, message: "Unable to fetch players" });
    }
  },
  getByGeneratedId: async (req, res) => {
    try {
      const playerId = parseInt(req.params.id); // Convert id to number if necessary
      const affiliateFilter = getAffiliateFilter(req);

      const players = await Player.aggregate([
        {
          $match: {
            id: playerId,
            isDeleted: false,
            isActive: true,
            ...(affiliateFilter || {}),
          },
        },
        {
          $lookup: {
            from: "wallets",
            localField: "_id",
            foreignField: "playerId",
            as: "wallets",
          },
        },
        {
          $unwind: { path: "$wallets", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "currencies",
            localField: "wallets.currency",
            foreignField: "_id",
            as: "wallets.currency",
          },
        },
        {
          $unwind: {
            path: "$wallets.currency",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: "$_id",
            playerData: { $first: "$$ROOT" },
            wallets: {
              $push: {
                _id: "$wallets._id",
                balance: "$wallets.total",
                currency: "$wallets.currency",
                walletCategory: "$wallets.walletCategory",
              },
            },
          },
        },
        {
          $addFields: {
            "playerData.wallets": "$wallets",
          },
        },
        {
          $replaceRoot: { newRoot: "$playerData" },
        },
        {
          $addFields: {
            blockedByObjId: {
              $cond: [
                { $eq: [{ $type: "$blockedBy" }, "string"] },
                { $toObjectId: "$blockedBy" },
                "$blockedBy",
              ],
            },
          },
        },
        {
          $lookup: {
            from: "affiliateusers",
            localField: "blockedByObjId",
            foreignField: "_id",
            as: "blockedByAdmin",
          },
        },
        {
          $unwind: {
            path: "$blockedByAdmin",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "players",
            localField: "referredByPlayerId",
            foreignField: "_id",
            as: "referredByPlayerDoc",
          },
        },
        {
          $unwind: {
            path: "$referredByPlayerDoc",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "affiliateusers",
            localField: "affiliateAdminUserId",
            foreignField: "_id",
            as: "affiliateAdminUserDoc",
          },
        },
        {
          $unwind: {
            path: "$affiliateAdminUserDoc",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            blockedBy: "$blockedByAdmin.email",
            blockedById: "$blockedByObjId",
            acquisitionSourceLabel: buildAcquisitionSourceLabelProjection(),
            referredByPlayer: {
              $cond: [
                { $ifNull: ["$referredByPlayerDoc._id", false] },
                {
                  _id: "$referredByPlayerDoc._id",
                  id: "$referredByPlayerDoc.id",
                  username: "$referredByPlayerDoc.username",
                  email: "$referredByPlayerDoc.email",
                  referralCode: "$referredByPlayerDoc.referralCode",
                },
                null,
              ],
            },
            affiliateAdminUser: {
              $cond: [
                { $ifNull: ["$affiliateAdminUserDoc._id", false] },
                {
                  _id: "$affiliateAdminUserDoc._id",
                  id: "$affiliateAdminUserDoc.id",
                  username: "$affiliateAdminUserDoc.username",
                  email: "$affiliateAdminUserDoc.email",
                },
                null,
              ],
            },
          },
        },
        {
          $project: {
            __v: 0,
            updatedAt: 0,
            password: 0,
            isDeleted: 0,
            "wallets.__v": 0,
            "wallets.isDeleted": 0,
            "wallets.createdAt": 0,
            "wallets.updatedAt": 0,
            "wallets.currency.__v": 0,
            "wallets.currency.createdAt": 0,
            "wallets.currency.updatedAt": 0,
            "wallets.currency.isDeleted": 0,
            blockedByAdmin: 0,
            blockedByObjId: 0,
            referredByPlayerDoc: 0,
            affiliateAdminUserDoc: 0,
          },
        },
      ]);

      if (!players || players.length === 0) {
        return res.status(404).json({ error: "Player not found" });
      }
      res.status(200).json(players[0]);
    } catch (error) {
      req.logMsg(MSG.PLAYER_GET_ERR, { error }, "error");
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },
  getById: async (req, res) => {
    try {
      logger.debug("players.get_by_id.params", { playerId: req.params.id });

      const affiliateFilter = getAffiliateFilter(req);
      const baseQuery = {
        _id: req.params.id,
        ...(affiliateFilter || {}),
      };
      const player = await Player.findOne(baseQuery)
        .select("-__v -createdAt -updatedAt -isDeleted")
        .populate({
          path: "languageId",
          select: "name -_id",
        })
        .populate({
          path: "countryId",
          select: "name -_id",
        })
        .populate({
          path: "blockedBy",
          select: "email",
        });
      // .populate({
      //   path: "wallet",
      //   select: "-__v -createdAt -updatedAt -isDeleted",
      // });

      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      const playerObj = player.toObject();
      const blockedByEmail = playerObj?.blockedBy?.email || null;
      const blockedById = playerObj?.blockedBy?._id || null;

      req.logMsg(MSG.PLAYER_GET_OK, { playerId: player.id });
      res.json({
        ...playerObj,
        blockedBy: blockedByEmail,
        blockedById,
      });
    } catch (error) {
      req.logMsg(MSG.PLAYER_GET_ERR, { error }, "error");
      res.status(500).json({ message: error.message });
    }
  },
  filterPlayers: async (req, res) => {
    try {
      const filters = { isDeleted: false, isActive: true };
      const affiliateFilter = getAffiliateFilter(req);
      if (affiliateFilter) {
        Object.assign(filters, affiliateFilter);
      }

      if (req.query.id) filters.id = parseInt(req.query.id);
      if (req.query.email) filters.email = req.query.email;
      if (req.query.country) filters["countryId.name"] = req.query.country; // Filter by country name
      if (req.query.dateOfBirth && req.query.dateOfBirthComp) {
        filters["verify1.birthDate"] = {
          [`$${req.query.dateOfBirthComp}`]: new Date(req.query.dateOfBirth),
        };
      }
      if (req.query.registrationDate && req.query.registrationDateComp) {
        filters.registerDate = {
          [`$${req.query.registrationDateComp}`]: new Date(
            req.query.registrationDate,
          ),
        };
      }
      if (req.query.lastLogin && req.query.lastLoginComp) {
        filters.lastLogin = {
          [`$${req.query.lastLoginComp}`]: new Date(req.query.lastLogin),
        };
      }
      if (req.query.isValidated)
        filters.verifyLevel = Number(req.query.isValidated);
      // if (req.query.isRegistered) filters.isRegistered = req.query.isRegistered === "true";
      // if (req.query.language) filters["languageId.name"] = req.query.language; // Filter by language name
      if (req.query.mobileNumber)
        filters["verify1.mobileNumber"] = req.query.mobile;
      if (req.query.mobileCountryCode)
        filters["verify1.mobileCountryCode"] = req.query.mobileCountryCode;

      const players = await Player.aggregate([
        { $match: filters },
        {
          $lookup: {
            from: "wallets",
            localField: "_id",
            foreignField: "playerId",
            as: "wallets",
          },
        },
        {
          $unwind: { path: "$wallets", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "currencies",
            localField: "wallets.currency",
            foreignField: "_id",
            as: "wallets.currency",
          },
        },
        {
          $unwind: {
            path: "$wallets.currency",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: "$_id",
            playerData: { $first: "$$ROOT" },
            wallets: {
              $push: {
                _id: "$wallets._id",
                balance: "$wallets.total",
                currency: "$wallets.currency",
                walletCategory: "$wallets.walletCategory",
              },
            },
          },
        },
        {
          $addFields: {
            "playerData.wallets": "$wallets",
          },
        },
        {
          $replaceRoot: { newRoot: "$playerData" },
        },
        {
          $lookup: {
            from: "languages",
            localField: "languageId",
            foreignField: "_id",
            as: "language",
          },
        },
        {
          $lookup: {
            from: "countries",
            localField: "countryId",
            foreignField: "_id",
            as: "country",
          },
        },
        {
          $unwind: { path: "$language", preserveNullAndEmptyArrays: true },
        },
        {
          $unwind: { path: "$country", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "affiliateusers",
            localField: "blockedBy",
            foreignField: "_id",
            as: "blockedByAdmin",
          },
        },
        {
          $unwind: {
            path: "$blockedByAdmin",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            blockedBy: "$blockedByAdmin.email",
            blockedById: "$blockedBy",
          },
        },
        {
          $project: {
            __v: 0,
            createdAt: 0,
            updatedAt: 0,
            "wallets.__v": 0,
            "wallets.isDeleted": 0,
            "wallets.createdAt": 0,
            "wallets.updatedAt": 0,
            "wallets.currency.__v": 0,
            "wallets.currency.createdAt": 0,
            "wallets.currency.updatedAt": 0,
            "wallets.currency.isDeleted": 0,
            blockedByAdmin: 0,
          },
        },
      ]);
      req.logMsg(MSG.PLAYER_GETALL_OK, { count: players.length });
      res.status(200).json(players);
    } catch (error) {
      req.logMsg(MSG.PLAYER_GETALL_ERR, { error }, "error");
      res.status(500).json({ message: "Error filtering players", error });
    }
  },
  updatePlayer: async (req, res) => {
    try {
      const { id } = req.params;

      const affiliateFilter = getAffiliateFilter(req);
      let player = await Player.findOne({
        _id: id,
        ...(affiliateFilter || {}),
      });
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      const directFields = [
        "username",
        "addressLine",
        "postalCode",
        "addressLine2",
        "marketingCodeId",
        "revenueId",
      ];

      directFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          player[field] = req.body[field];
        }
      });

      const verifyFields = [
        "firstname",
        "surname",
        "birthDate",
        "mobileNumber",
        "mobileCountryCode",
        "placeOfBirth",
        "occupation",
        "occupationIndustry",
        "residentialAddress",
        "countryId",
        "cityId",
        "languageId",
      ];

      req.body.verify1 = req.body.verify1 || {};
      verifyFields.forEach((field) => {
        if (req.body.verify1[field] !== undefined) {
          player.verify1[field] = req.body.verify1[field];
        }
      });

      await player.save();
      req.logMsg(MSG.PLAYER_UPDATE_OK, { playerId: player.id });
      res.json({ message: "Player updated successfully", player });
    } catch (error) {
      req.logMsg(MSG.PLAYER_UPDATE_ERR, { error }, "error");
      res.status(500).json({ message: error.message });
    }
  },
  blockPlayer: async (req, res) => {
    try {
      const { id, adminId } = req.params;
      const { blockReason } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(adminId)) {
        return res.status(400).json({ message: "Invalid admin ID" });
      }

      const reason =
        typeof blockReason === "string" && blockReason.trim()
          ? blockReason.trim()
          : "Your account has been blocked by admin.";
      const affiliateFilter = getAffiliateFilter(req);
      const player = await Player.findOneAndUpdate(
        {
          _id: id,
          ...(affiliateFilter || {}),
        },
        {
          isBlocked: true,
          blockedAt: new Date(),
          blockedBy: new mongoose.Types.ObjectId(adminId),
          blockReason: reason,
        },
        { new: true },
      ).select("id username email isBlocked blockedAt blockedBy blockReason");

      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      await publishPlayerForceLogout(player._id, {
        event: "force_logout",
        reason,
      });

      return res.json({ success: true, data: player });
    } catch (error) {
      req.logMsg(MSG.PLAYER_UPDATE_ERR, { error }, "error");
      return res.status(500).json({ message: "Internal Server Error" });
    }
  },
  unblockPlayer: async (req, res) => {
    try {
      const { id } = req.params;

      const affiliateFilter = getAffiliateFilter(req);
      const player = await Player.findOneAndUpdate(
        {
          _id: id,
          ...(affiliateFilter || {}),
        },
        {
          isBlocked: false,
          blockedAt: null,
          blockedBy: null,
          blockReason: null,
        },
        { new: true },
      ).select("id username email isBlocked blockedAt blockedBy blockReason");

      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      return res.json({ success: true, data: player });
    } catch (error) {
      req.logMsg(MSG.PLAYER_UPDATE_ERR, { error }, "error");
      return res.status(500).json({ message: "Internal Server Error" });
    }
  },

  changePlayerPassword: async (req, res) => {
    try {
      const { id } = req.params;
      const { password, confirmPassword } = req.body;

      if (!password || !confirmPassword) {
        return res
          .status(400)
          .json({ message: "Password fields are required" });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ message: "Passwords do not match" });
      }

      const affiliateFilter = getAffiliateFilter(req);
      const player = await Player.findOne({
        _id: id,
        ...(affiliateFilter || {}),
      });
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      player.password = hashedPassword;

      await player.save();
      req.logMsg(MSG.PLAYER_PASSWORD_CHANGE_OK, { playerId: id });
      return res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      req.logMsg(MSG.PLAYER_PASSWORD_CHANGE_ERR, { error }, "error");
      return res.status(500).json({ message: "Internal Server Error" });
    }
  },
  create: async (req, res) => {
    const session = await mongoose.startSession();
    try {
      let resultPayload;
      const affiliateFilter = getAffiliateFilter(req);
      await session.withTransaction(
        async () => {
          const {
            email,
            password,
            username,
          } = req.body;

          // 1) Uniqueness
          const [existingPlayer, existingUsername] = await Promise.all([
            Player.findOne({ email }).session(session),
            Player.findOne({ username }).session(session),
          ]);
          if (existingPlayer) {
            // Throw to exit withTransaction; we'll map to 409 outside.
            const e = new Error("Email already in use");
            e.code = "E_DUP_EMAIL";
            throw e;
          }
          if (existingUsername) {
            const e = new Error("Username already in use");
            e.code = "E_DUP_USERNAME";
            throw e;
          }

          // 2) Base level (native driver + session)
          const gamificationLevelsCol =
            mongoose.connection.db.collection("gamificationLevels");
          const baseLevel = await gamificationLevelsCol.findOne(
            { level: 0, isDeleted: { $ne: true } },
            { projection: { _id: 1 }, session },
          );
          if (!baseLevel) {
            const e = new Error("Base gamification level (level 0) not found");
            e.code = "E_BASE_LEVEL_MISSING";
            throw e;
          }

          // 3) Password + 2FA
          const hashedPassword = await bcrypt.hash(password, 10);
          const domain = process.env.BASE_URL || "staging.pixupplay.tech";
          const issuerName = domain.replace(/^https?:\/\//, "");
          const secret = speakeasy.generateSecret({ length: 20 });
          const twoFaUrl = `otpauth://totp/${issuerName}:${username}?secret=${secret.base32}&issuer=${issuerName}`;

          // 4) Sequential IDs (ensure helper uses session)
          const id = await getNextSequence("Players", session);

          // 5) Player
          const newPlayer = await new Player({
            id,
            email,
            username,
            password: hashedPassword,
            isActive: true,
            isDeleted: false,
            ...(affiliateFilter
              ? { affiliateAdminUserId: affiliateFilter.affiliateAdminUserId }
              : {}),
            registerDate: new Date(),
            preferences: {
              ghostMode: false,
              hideStatistics: false,
              hideAllRaceStatistics: false,
              excludeFromRain: false,
              receiveEmailOffers: true,
              receiveSmsOffers: true,
            },
            verify1: {
              firstname: null,
              surname: null,
              countryName: null,
              placeOfBirth: null,
              birthDate: null,
              residentialAddress: null,
              cityId: null,
              occupationIndustry: null,
              occupation: null,
              mobileCountryCode: null,
              mobileNumber: null,
            },
            twoFaSecretBase32: secret.base32,
            twoFaUrl,
            twoFAValidated: false,
            verifyLevel: 0,
            gamificationLevel: baseLevel._id,
            createdAt: new Date(),
          }).save({ session });

          // payload to return after commit
          resultPayload = {
            id: newPlayer.id,
            message: "Player created successfully (admin)",
          };
        },
        {
          readConcern: { level: "local" },
          writeConcern: { w: "majority" },
          readPreference: "primary",
        },
      );

      // withTransaction committed successfully
      req.logMsg?.(MSG.PLAYER_CREATE_OK, {
        /* playerId later */
      });
      return res.status(201).json(resultPayload);
    } catch (error) {
      // NOTE: withTransaction already aborted on throw
      req.logMsg?.(MSG.PLAYER_CREATE_ERR, { error }, "error");

      // map known errors to 4xx
      if (error?.code === "E_DUP_EMAIL" || error?.code === "E_DUP_USERNAME") {
        return res.status(409).json({ error: error.message });
      }
      if (error?.code === "E_BASE_LEVEL_MISSING") {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal Server Error" });
    } finally {
      // Always end session here
      await session.endSession().catch(() => {});
    }
  },
};

module.exports = playerController;

