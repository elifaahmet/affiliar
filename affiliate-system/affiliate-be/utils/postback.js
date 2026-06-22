"use strict";

// Supported macros in an affiliate's postback URL template. Both {click_id}
// and {sub_id} map to the same value (the subId carried on the affiliate's
// tracking link) — different networks name it differently.
const POSTBACK_MACROS = [
  "click_id",
  "sub_id",
  "event",
  "player_id",
  "amount",       // major units (e.g. 12.50)
  "amount_cents", // integer cents
  "currency",
  "affiliate_code",
  "brand_id",
  "timestamp",    // unix seconds
];

// Build the final postback URL by substituting {macros} from a delivery row.
// Values are URI-encoded. Unknown macros are left untouched so a typo is
// visible rather than silently blanked.
function buildPostbackUrl(template, delivery) {
  const cents = Number(delivery.amountCents) || 0;
  const occurred = delivery.occurredAt ? new Date(delivery.occurredAt) : new Date();
  const values = {
    click_id:       delivery.clickId ?? "",
    sub_id:         delivery.clickId ?? "",
    event:          delivery.event ?? "",
    player_id:      delivery.playerId ?? "",
    amount:         (cents / 100).toFixed(2),
    amount_cents:   String(cents),
    currency:       delivery.currency ?? "",
    affiliate_code: delivery.affiliateCode ?? "",
    brand_id:       delivery.brandId ?? "",
    timestamp:      String(Math.floor(occurred.getTime() / 1000)),
  };
  return String(template).replace(/\{(\w+)\}/g, (whole, key) =>
    key in values ? encodeURIComponent(values[key]) : whole,
  );
}

module.exports = { POSTBACK_MACROS, buildPostbackUrl };
