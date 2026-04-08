const dayjs = require("dayjs");
const Player = require("./models/Player");
const calculatePlayerDashboardData = require("./utils/calculatePlayerDashboardData");
const connectDB = require("./config/db");
const { toRedis } = require("./redis/dashboardService");
const { logMsg } = require("./middlewares/logger");
const { MSG } = require("./middlewares/log-messages");

// connectDB();

const backfillPlayerDashboard = async () => {
  logMsg(MSG.BACKFILL_START);

  try {
    const players = await Player.find(
      { isDeleted: false, isActive: true },
      { _id: 1 }
    );

    logMsg(MSG.BACKFILL_PLAYER_SCAN_OK, { count: players.length });

    for (const player of players) {
      const playerId = player._id.toString();

      for (let i = 1; i <= 63; i++) {
        const date = dayjs().subtract(i, "day");
        const start = date.startOf("day").toDate();
        const end = date.endOf("day").toDate();
        const dateKey = date.format("YYYY-MM-DD");
        const redisKey = `dashchannel-player:${playerId}:${dateKey}`;

        try {
          const data = await calculatePlayerDashboardData(playerId, start, end);

          await toRedis(redisKey, data);

          // You can add useful metrics if available on `data`
          logMsg(MSG.BACKFILL_PLAYER_DAY_OK, {
            playerId,
            dateKey,
            keys: Object.keys(data || {}),
          });
        } catch (err) {
          logMsg(
            MSG.BACKFILL_PLAYER_DAY_ERR,
            { playerId, dateKey, error: err },
            "error"
          );
        }
      }
    }

    logMsg(MSG.BACKFILL_DONE);
  } catch (outerErr) {
    // A catch-all in case player scan or a top-level failure happens
    logMsg(
      MSG.BACKFILL_PLAYER_DAY_ERR,
      { scope: "top_level", error: outerErr },
      "error"
    );
  }
};

// backfillPlayerDashboard();
module.exports = backfillPlayerDashboard;
