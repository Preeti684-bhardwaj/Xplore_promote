const passport = require("passport");
const jwt = require("jsonwebtoken");
const db = require("../dbConfig/dbConfig.js");
require("dotenv").config();
const { CLIENT_ID, ANDROID_ENDUSER_CLIENT_ID, WEB_ENDUSER_CLIENT_ID } =
  process.env;
const User = db.users;
const Campaign = db.campaigns;
const { Op } = require("sequelize");
const sequelize = db.sequelize;
const { OAuth2Client } = require("google-auth-library");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");
const { isValidEmail, isPhoneValid } = require("../validators/validation.js");
const {
  processgmailUser,
  formatgmailUserResponse,
} = require("../validators/userValidation.js");

const googleClient = new OAuth2Client({
  clientId: CLIENT_ID || ANDROID_ENDUSER_CLIENT_ID || WEB_ENDUSER_CLIENT_ID
});

const verifyGoogleLogin= async(idToken)=>{
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: [
        CLIENT_ID, 
        ANDROID_ENDUSER_CLIENT_ID, 
        WEB_ENDUSER_CLIENT_ID
      ]
    });
    
    const payload = ticket.getPayload();
    console.log("Full token payload:", JSON.stringify(payload, null, 2));
    console.log("Token audience:", payload.aud);
    
    return payload;
  } catch (error) {
    console.error("Detailed error verifying Google token:", {
      message: error.message,
      stack: error.stack
    });
    return null;
  }
}
//-----------------google signin------------------
const googleLogin = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    // Extract and validate inputs
    const { visitorId, deviceId, campaignID } = req.body;
    // Get token from Authorization header and remove 'Bearer ' if present
    const authHeader = req.headers["authorization"];
    const idToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;
      console.log(idToken);
      
    // Validate input parameters
    if (!visitorId || !campaignID) {
      console.error("Validation error: Device ID or Campaign ID is missing");
      return next(
        new ErrorHandler("Visitor ID and Campaign ID are required", 400)
      );
    }
    if (!idToken || idToken === "null") {
      console.error("Validation error: Authorization token is missing");
      return next(new ErrorHandler("Authorization token is required", 401));
    }
     // Verify Google token
    let googlePayload;
    try {
      googlePayload = await verifyGoogleLogin(idToken);
      if (!googlePayload?.sub) {
        return next(
          new ErrorHandler("Invalid Google account information", 400)
        );
      }
    } catch (error) {
      if (error.message.includes("Token used too late")) {
        return next(
          new ErrorHandler(
            "Authentication token has expired. Please login again.",
            401
          )
        );
      }
      return next(new ErrorHandler("Failed to validate Google token", 401));
    }

    const googleUserId = googlePayload?.sub;

    // Check if campaign exists
    let campaign;
    try {
      campaign = await Campaign.findByPk(campaignID, { transaction });
      if (!campaign) {
        console.error("Campaign not found with ID:", campaignID);
        await transaction.rollback();
        return next(new ErrorHandler("Campaign not found", 404));
      }
      console.log("Campaign found:", campaignID);
    } catch (campaignError) {
      console.error("Error fetching campaign:", campaignError);
       return next(new ErrorHandler("Error fetching campaign", 500));
    }
    // Search conditions
    const searchConditions = {
      [Op.or]: [
        ...(googleUserId ? [{ googleUserId }] : []),
        ...(deviceId ? [{ deviceId: { [Op.contains]: [deviceId] } }] : []),
        ...(visitorId ? [{ visitorIds: { [Op.contains]: [visitorId] } }] : []),
      ],
    };
    // Try to find user by Google ID or email
    let existingUser = await User.findOne({
      where: searchConditions,
      include: [
        {
          model: Campaign,
          as: "campaigns",
          through: { where: { campaignID } },
        },
      ],
      transaction,
    });

    if (!existingUser) {
      // Validate email if present
      if (googlePayload.email && !isValidEmail(googlePayload.email)) {
        return next(
          new ErrorHandler("Invalid email format from Google account", 400)
        );
      }
    }

    // Process user
    const user = await processgmailUser(
      existingUser,
      googlePayload,
      campaignID,
      transaction
    );
    // Commit transaction
    await transaction.commit();

    // Return response
    return res.status(200).json({
      status: true,
      message: existingUser ? "Login successful" : "Signup successful",
      user: formatgmailUserResponse(user)
    });
  } catch (error) {
    // Rollback transaction
    await transaction.rollback();

    // Log and handle errors
    console.error("Google login error:", error);
    return next(
      error instanceof ErrorHandler
        ? error
        : new ErrorHandler(
            error.message ||
              "An error occurred during login. Please try again later.",
            500
          )
    );
  }
});

module.exports = {googleLogin};
