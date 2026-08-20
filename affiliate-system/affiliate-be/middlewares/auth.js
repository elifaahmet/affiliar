const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { SECRET_KEY } = require("../utils/jwtSecret");

const authorize = (requiredPermissions = []) => {
  return async (req, res, next) => {
    const authHeader = req.header("Authorization");
    if (!authHeader) {
      return res.status(401).json({ error: "Authorization header is missing" });
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "Token is missing" });
    }

    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      const user = await User.findById(decoded.sub);
      if (!user || user.isDeleted) {
        return res.status(403).json({ error: "User not found or deleted" });
      }

      req.user = decoded;
      req.affiliateUser = user;
      req.roleName = user.role;
      next();
    } catch (err) {
      res.status(401).json({ error: "Invalid token" });
    }
  };
};

module.exports = authorize;
