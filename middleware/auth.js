const db = require("../dbConfig/dbConfig");
const User = db.users;
const Admin=db.admins;
// const EndUser = db.endUsers;
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
    if(error.message == "jwt expired"){
      return next(new ErrorHandler("Token expired", 401));
    }
    return next(new ErrorHandler(error.message, 500));
  }
};
const verifyIp = async (req, res, next) => {
  try {
      // Get IP from X-Forwarded-For header or fallback to REMOTE_ADDR
      const forwardedIp = req.headers['x-forwarded-for'];
      const remoteAddr = req.socket.remoteAddress;
      console.log(req);
      
      // If X-Forwarded-For exists, take the first IP in the list
      // Otherwise use REMOTE_ADDR
      if (forwardedIp) {
          // X-Forwarded-For can contain multiple IPs, get the first one
          const ips = forwardedIp.split(',');
          req.ipAddress = ips[0].trim();
      } else {
          req.ipAddress = remoteAddr;
      }

      // Handle case where both might be undefined
      if (!req.ipAddress) {
          req.ipAddress = 'Unknown';
      }

      // Remove IPv6 prefix if present
      req.ipAddress = req.ipAddress.replace(/^::ffff:/, '');
      
      next();
  } catch (err) {
      console.error('Error in IP verification middleware:', err);
      next(err);
  }
};

// -------------verify admin-----------------------------
const verifyAdmin = async (req, res, next) => {
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

    // Find admin
    const admin = await Admin.findOne({
      where: { id: userId },
      attributes: { exclude: ["password"] },
    });

    if (!admin) {
      return next(new ErrorHandler("Invalid token or admin not found", 401));
    }

    // Determine platform and OS
    const userAgent = req.headers["user-agent"];
    const platform = getPlatform(userAgent);

    // Attach info to request
    req.platform = platform;
    req.admin = admin;
    // req.token = token;
    console.log(req.admin);

    next();
  } catch (error) {
    if(error.message == "jwt expired"){
      return next(new ErrorHandler("Token expired", 401));
    }
    return next(new ErrorHandler(error.message, 500));
  }
};
// ---------------verify enduser---------------------------
const verifyEndUser = async (req, res, next) => {
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

    // find end user
    const endUser = await User.findOne({
      where: { id: userId },
    });
    console.log(endUser);

    if (!endUser) {
      return next(new ErrorHandler("Invalid token or enduser not found", 401));
    }

    req.endUser = endUser;

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
        new ErrorHandler(
          `session doesn't belongs to this user ${req.user?.id}`,
          403
        )
      );
    }

    if (!session) {
      return next(new ErrorHandler("Session expired, Please login again", 401));
    }

    req.session = session.channel;
    next();
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
};

module.exports = { verifyJWt,verifyAdmin,verifyEndUser, authorize, verifyUserAgent, verifySession,verifyIp };
