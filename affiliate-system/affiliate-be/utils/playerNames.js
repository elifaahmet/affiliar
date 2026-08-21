"use strict";

// Player ids are the casino's, so Affiliar only knows a player's name once
// /players/sync-names has cached it in PlayerName. Anything that lists players
// — reports, crew tables, referral activity — has to join through here, or it
// shows raw ids and no amount of syncing changes what the operator sees.

const PlayerName = require("../models/PlayerName");

// Attach `<field>Username` for each id field named in `fields`.
//
// Rows keep their ids: the name is a display convenience, and the id is still
// what identifies the player everywhere else (support, the casino, exports).
async function attachPlayerUsernames(operatorId, rows, fields = ["playerId"]) {
  if (!Array.isArray(rows) || !rows.length) return rows;

  const ids = new Set();
  for (const row of rows) {
    for (const f of fields) {
      if (row[f]) ids.add(String(row[f]));
    }
  }
  if (!ids.size) return rows;

  const names = await PlayerName.find({
    operatorId,
    playerId: { $in: [...ids] },
  })
    .select("playerId username")
    .lean();

  const byId = new Map(names.map((n) => [n.playerId, n.username]));
  for (const row of rows) {
    for (const f of fields) {
      row[`${f}Username`] = row[f] ? byId.get(String(row[f])) || null : null;
    }
  }
  return rows;
}

module.exports = { attachPlayerUsernames };
