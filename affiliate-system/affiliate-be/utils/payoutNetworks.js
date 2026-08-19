"use strict";

/**
 * What an affiliate is allowed to be paid in.
 *
 * This mirrors what Coinflux will accept on `POST /withdrawals` — see
 * coinflux `src/chains.js`. Keeping the list here too isn't duplication for
 * its own sake: the affiliate sets their wallet months before any payout is
 * dispatched, and rejecting an impossible pair at the form is far better than
 * discovering it when the money is meant to move.
 *
 * USDC does not exist on Tron, so TRC20 is USDT-only.
 */

const PAYOUT_PAIRS = {
  TRC20: ["USDT"],
  ERC20: ["USDT", "USDC"],
  BEP20: ["USDT", "USDC"],
};

const PAYOUT_NETWORKS   = Object.keys(PAYOUT_PAIRS);
const PAYOUT_CURRENCIES = [...new Set(Object.values(PAYOUT_PAIRS).flat())];

const DEFAULT_NETWORK  = "TRC20";
const DEFAULT_CURRENCY = "USDT";

// Human labels for the UI and confirmation copy.
const NETWORK_LABELS = {
  TRC20: "Tron (TRC20)",
  ERC20: "Ethereum (ERC20)",
  BEP20: "BNB Smart Chain (BEP20)",
};

// Address shapes. Not checksums — the provider does that. This catches the
// mistake that actually happens: a Tron address saved against an EVM chain, or
// the reverse. Sent to the wrong chain the funds do not come back.
const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const EVM_ADDRESS_RE  = /^0x[a-fA-F0-9]{40}$/;

function normNetwork(network) {
  return String(network || "").trim().toUpperCase();
}

function normCurrency(currency) {
  return String(currency || "").trim().toUpperCase();
}

function isPayoutPair(network, currency) {
  return (PAYOUT_PAIRS[normNetwork(network)] || []).includes(normCurrency(currency));
}

function addressMatchesNetwork(network, address) {
  const net = normNetwork(network);
  const addr = String(address || "").trim();
  if (net === "TRC20") return TRON_ADDRESS_RE.test(addr);
  if (net === "ERC20" || net === "BEP20") return EVM_ADDRESS_RE.test(addr);
  return false;
}

// What to tell someone who got the address wrong, per network.
function addressHint(network) {
  return normNetwork(network) === "TRC20"
    ? "must be 34 characters starting with T"
    : "must be 42 characters starting with 0x";
}

module.exports = {
  PAYOUT_PAIRS,
  PAYOUT_NETWORKS,
  PAYOUT_CURRENCIES,
  DEFAULT_NETWORK,
  DEFAULT_CURRENCY,
  NETWORK_LABELS,
  isPayoutPair,
  addressMatchesNetwork,
  addressHint,
  normNetwork,
  normCurrency,
};
