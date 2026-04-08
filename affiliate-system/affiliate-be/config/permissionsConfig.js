// Centralized brand-based permissions config

// Returns normalized brand key based on several env vars.
// betroxy or staging => full list; 365leo => casino-only (no sportsbook/exchange)
function getBrandFromEnv() {
  const raw = (process.env.BASE_URL || process.env.BASE_DOMAIN || "")
    .toString()
    .trim()
    .toLowerCase();

  if (raw.includes("ruinbet")) return "ruinbet";
  if (raw.includes("365leo")) return "365leo";
  if (raw.includes("betroxy") || raw.includes("staging")) return "betroxy";

  // Default to betroxy-style (all features) when unknown
  return "betroxy";
}

// Prefixes to exclude for each brand
const exclusionsByBrand = {
  // For 365leo, remove sportsbook and exchange areas (leave casino)
  "365leo": [
    // Player settings
    "players.list.detail.settings.sportsbookLimits",
    "players.list.detail.settings.exchangeLimits",
    // Management
    "management.sportsbook",
    "management.exchange",
  ],
  // For ruinbet, same rule set: casino-only
  ruinbet: [
    "players.list.detail.settings.sportsbookLimits",
    "players.list.detail.settings.exchangeLimits",
    "management.sportsbook",
    "management.exchange",
  ],
};

function filterPermissionsByBrand(permissionGroups, brandKey) {
  const excludePrefixes = exclusionsByBrand[brandKey] || [];
  if (!excludePrefixes.length) return permissionGroups;

  const filtered = permissionGroups
    .map((group) => ({
      ...group,
      rules: (group.rules || []).filter(
        (r) => !excludePrefixes.some((p) => r.resource.startsWith(p))
      ),
    }))
    .filter((g) => (g.rules || []).length > 0);

  return filtered;
}

module.exports = {
  getBrandFromEnv,
  filterPermissionsByBrand,
};
