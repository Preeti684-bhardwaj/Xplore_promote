const db = require("../dbConfig/dbConfig");
const User = db.users;
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: "./.env" });

const verifyJWt = async (req, res, next) => {
  try {
    // Get the token from Authorization header
    const bearerHeader = req.headers["authorization"];

    // Check if bearer header exists
    if (!bearerHeader) {
      return res.status(401).json({
        success: false,
        message: "Access Denied. No token provided.",
      });
    }

    // Extract the token
    // Format in Postman: "Bearer eyJhbGciOiJIUzI1NiIs..."
    const token = bearerHeader.replace("Bearer ", "").trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access Denied. Token is required.",
      });
    }

    // Verify token
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    req.decodedToken = decodedToken;

    // Get user ID from token
    const userId = decodedToken.obj.obj.id;

    // Find user
    const user = await User.findOne({
      where: { id: userId },
      attributes: { exclude: ["password"] },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid token or user not found",
      });
    }

    // Attach user to request
    req.user = user;
    req.token=c;
    next();
  } catch (error) {
    return res.status(500).send({ success: false, message: error.message });
  }
};

module.exports = { verifyJWt };
