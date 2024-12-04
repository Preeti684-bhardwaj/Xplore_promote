const db = require("../dbConfig/dbConfig.js");
const User = db.users;
const Campaign = db.campaigns;
const { Op } = require("sequelize");
const sequelize = db.sequelize;
require("dotenv").config();
const {
  // generateToken,
  processUser,
  // generateUserToken,
  getUserMessage,
  formatUserResponse,
  validateAppleToken,
} = require("../validators/userValidation.js");
// const { isPhoneValid } = require("../validators/validation.js");
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
//----------------Add phone number--------------------------------------------------
// const applePhone = asyncHandler(async (req, res, next) => {
//   try {
//     const { phone } = req.body;
//     const userId = req.user?.id;

//     // Input validation
//     if (!phone) {
//       return next(new ErrorHandler("Missing phone number", 400));
//     }

//     if (!userId) {
//       return next(new ErrorHandler("Invalid authentication token", 401));
//     }

//     const phoneError = isPhoneValid(phone);
//     if (phoneError) {
//       return next(new ErrorHandler(phoneError, 400));
//     }

//     // Find and validate user
//     const user = await User.findOne({
//       where: { id: userId },
//     });

//     if (!user) {
//       return next(new ErrorHandler("User not found", 404));
//     }

//     if (!user.isEmailVerified) {
//       return next(
//         new ErrorHandler(
//           "Email not verified. Please verify your email first.",
//           403
//         )
//       );
//     }

//     // Check for duplicate phone number across all users
//     const existingPhoneUser = await User.findOne({
//       where: {
//         phone,
//         id: { [Op.ne]: userId }, // Exclude current user
//       },
//     });

//     if (existingPhoneUser) {
//       return next(
//         new ErrorHandler(
//           "Phone number already registered to another account",
//           409
//         )
//       );
//     }

//     if (user.phone) {
//       return next(
//         new ErrorHandler("Phone number already exists for this user", 409)
//       );
//     }

//     // Update phone number with retry logic
//     let retries = 3;
//     while (retries > 0) {
//       try {
//         await user.update({
//           phone,
//         });
//         break;
//       } catch (error) {
//         retries--;
//         if (retries === 0) throw error;
//         await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retry
//       }
//     }

//     // Audit log for phone number update
//     console.log(`Phone number updated for user ID: ${user.id}`);

//     return res.status(200).json({
//       status: true,
//       message: "Phone number added successfully",
//       user: {
//         id: user.id,
//         email: user.email,
//         phone: user.phone,
//       },
//     });
//   } catch (error) {
//     console.error("Phone update error:", error);
//     return next(new ErrorHandler(error.message, 500));
//   }
// });

// ---------------get user by appleUserId ---------------------------------
// const getUserByAppleUserId = asyncHandler(async (req, res, next) => {
//   try {
//     const idToken = req.headers["authorization"];
//     const decodedToken = validateAppleToken(idToken);
//     const { appleUserId } = req.params;
//     const user = await User.findOne({
//       where: { appleUserId: decodedToken.sub || appleUserId },
//     });
//     if (!user) {
//       return next(new ErrorHandler("User not found", 404));
//     }
//     return res.status(200).json({
//       status: true,
//       user: {
//         id: user.id,
//         email: user.email,
//         name: user.name,
//         appleUserId: user.appleUserId,
//       },
//     });
//   } catch (error) {
//     return next(new ErrorHandler(error.message, 500));
//   }
// });

module.exports = {
  appleLogin,
  // getUserByAppleUserId,
  // applePhone,
};
