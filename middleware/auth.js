const db = require("../dbConfig/dbConfig");
const User = db.users;
const QrSession = db.qrSessions;
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { getPlatform, detectOS } = require("../validators/validation");
const ErrorHandler = require("../utils/ErrorHandler");

const verifyJWt = async (req, res, next) => {
  try {
    console.log(req.headers);

    // Get the token from Authorization header
    const bearerHeader = req.headers["authorization"];

    // Check if bearer header exists
    if (!bearerHeader) {
      return next(new ErrorHandler("Access Denied.", 401));
    }

    // Extract the token
    // Format in Postman: "Bearer eyJhbGciOiJIUzI1NiIs..."
    const token = bearerHeader.replace("Bearer ", "").trim();

    if (!token) {
      return next(new ErrorHandler("Access Denied. Token is required.", 401));
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
      return next(new ErrorHandler("Invalid token or user not found", 401));
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
    return next(new ErrorHandler(error.message, 500));
  }
};
//authorisation
const authorize = (roles = []) => {
  return [
    (req, res, next) => {
      console.log(req.decodedToken.obj.type);
      if (roles.length && !roles.includes(req.decodedToken.obj.type)) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      next();
    },
  ];
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
    return next(new ErrorHandler(error.message, 500));
  }
};

const verifySession = async (req, res, next) => {
  try {
    const userSession = req.headers["session"];
    console.log("verifysession", userSession);

    // Skip session verification for mobile users
    if (req.platform === "mobile") {
      return next();
    }
    if (!userSession) {
      return next(new ErrorHandler("Missing session in headers", 400));
    }
    // Verify session only for web users, including OS information
    const session = await QrSession.findOne({
      where: {
        channel: userSession,
      },
    });
    console.log(session);

    // First check if userId matches
    if (session?.userId && session.userId !== req.user?.id) {
      return next(
        new ErrorHandler(`session doesn't belongs to this user ${req.user?.id}`, 403)
      );
    }

    if (!session) {
      return next(new ErrorHandler("Session expired, Please login again", 401));
    }

    req.session =session.channel ;
    next();
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
};

module.exports = { verifyJWt, authorize,verifyUserAgent, verifySession };
