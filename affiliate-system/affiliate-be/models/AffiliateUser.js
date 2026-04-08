// Legacy shim: AffiliateUser is now replaced by User + AffiliateProfile.
// This re-export keeps old require() calls working during migration.
module.exports = require("./User");
