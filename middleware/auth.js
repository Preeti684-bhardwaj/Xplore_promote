const db = require("../dbConfig/dbConfig");
const User = db.users;
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: "./.env" });
const { getPlatform, detectOS } = require("../utils/validation");

const verifyJWt = async (req, res, next) => {
  try {
    console.log(req.headers);

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

    // Determine platform and OS
    const userAgent = req.headers["user-agent"];
    const platform = getPlatform(userAgent);

    // Attach info to request
    req.platform = platform;
    req.user = user;
    req.token = token;
    console.log(req.user);

    next();
  } catch (error) {
    return res.status(500).send({ success: false, message: error.message });
  }
};

const verifyUserAgent = async (req, res, next) => {
  try {
    console.log(req.headers);
    // Determine platform and OS
    const userAgent = req.headers["user-agent"];
    const os = detectOS(userAgent);
    req.userOS = os;

    console.log(req.userOS);

    next();
  } catch (error) {
    return res.status(500).send({ success: false, message: error.message });
  }
};

const verifySession = async (req, res, next) => {
  try {
    const userSession = req.headers["session"];
console.log("verifysession",userSession);

    // Skip session verification for mobile users
    if (req.platform === "mobile") {
      return next();
    }
    if(!userSession){
      return res.status(400).json({
        status: false,
        message: "Please provide session",
      });
    }

    // Verify session only for web users, including OS information
    const session = await db.qrSessions.findOne({
      where: {
        channel: userSession,
      },
    });

    if (!session) {
      return res.status(401).json({
        status: false,
        message: "Session expired, Please login again",
      });
    }
    next();
  } catch (error) {
    return res.status(500).send({ success: false, message: error.message });
  }
};


module.exports = { verifyJWt,verifyUserAgent, verifySession };
