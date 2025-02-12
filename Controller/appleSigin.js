const db = require("../dbConfig/dbConfig.js");
const User = db.users;
const Campaign = db.campaigns;
const { Op } = require("sequelize");
const sequelize = db.sequelize;
require("dotenv").config();
const {processUser,getUserMessage,formatUserResponse,validateAppleToken} = require("../validators/userValidation.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

// ---------------apple signin---------------------------------
const appleLogin = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const authHeader = req.headers["authorization"];
    const idToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;
    // Extract and validate inputs
    const { email, name, appleUserId, visitorId, deviceId, campaignID } =
      req.body;

    // Validate input parameters
    if (!visitorId || !campaignID) {
      console.error("Validation error: Device ID or Campaign ID is missing");
      return next(
        new ErrorHandler("Visitor ID and Campaign ID are required", 400)
      );
    }
    if (!idToken) {
      console.error("Validation error: Authorization token is missing");
      return next(new ErrorHandler("Authorization token is required", 401));
    }
    if (!appleUserId) {
      console.error("Validation error: Apple User ID is missing");
      return next(new ErrorHandler("Apple User ID is required", 400));
    }
    // Validate Apple token
    const decodedToken = await validateAppleToken(idToken);
    if (!decodedToken || !decodedToken.sub) {
      console.error("Apple token validation failed:", decodedToken);
      return next(new ErrorHandler("Invalid Apple token", 401));
    }
    // Verify campaign existence
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

    // Find user based on deviceId or visitorId
    // Search conditions
    const searchConditions = {
      [Op.or]: [
        ...(appleUserId ? [{ appleUserId }] : []),
        ...(deviceId ? [{ deviceId: { [Op.contains]: [deviceId] } }] : []),
        ...(visitorId ? [{ visitorIds: { [Op.contains]: [visitorId] } }] : []),
      ],
    };

    const existingUser= await User.findOne({
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

    // Process user based on existing user status
    const [user, userStatus] = await processUser({
      existingUser,
      decodedToken,
      email,
      name,
      appleUserId,
      deviceId,
      visitorId,
      campaignID,
      transaction,
    });
     // Generate authentication token
    //  let accessToken;
    //  try {
    //    const tokenPayload = {
    //      type: "USER",
    //      obj: {
    //        id: user.id,
    //        email: user.email,
    //        name: user.name,
    //        appleUserId: user.appleUserId,
    //      },
    //    };
    //   //  accessToken = generateToken(tokenPayload);
    //   //  console.log("Access token generated successfully.");
    //  } catch (tokenGenerationError) {
    //    console.error("Error generating token:", tokenGenerationError);
    //    return next(new ErrorHandler("Error generating access token", 500));
    //  }
  
    // Commit transaction
    await transaction.commit();

    // Prepare user response
    return res.status(200).json({
      success: true,
      message: getUserMessage(userStatus),
      data: {
        user: formatUserResponse(user)
      },
    });
  } catch (error) {
    // Rollback transaction on error
    await transaction.rollback();

    // Log and handle errors
    console.error("Apple Login Error:", error);
    return next(new ErrorHandler("Authentication failed", 500)
    );
  }
});

module.exports = {
  appleLogin
};
