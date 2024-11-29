const db = require("../dbConfig/dbConfig.js");
const EndUser = db.endUsers;
const Campaign = db.campaigns;
const { Op } = require("sequelize");
const sequelize = db.sequelize;
const { phoneValidation } = require("../utils/phoneValidation.js");
const { isValidEmail, isValidLength } = require("../validators/validation.js");
const {
  generateToken,
  validateAppleToken,
} = require("../validators/userValidation.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");
require("dotenv").config();
// const {
//   FingerprintJsServerApiClient,
//   Region
// } =require('@fingerprintjs/fingerprintjs-pro-server-api')
// const {FINGERPRINT_SECRETKEY,FINGERPRINT_REGION} = process.env
const { OAuth2Client } = require("google-auth-library");
const { ENDUSER_CLIENT_ID, WEB_ENDUSER_CLIENT_ID } = process.env;
const googleClient = new OAuth2Client({
  clientId: ENDUSER_CLIENT_ID || WEB_ENDUSER_CLIENT_ID,
});

async function verifyGoogleLogin(idToken) {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: ENDUSER_CLIENT_ID || WEB_ENDUSER_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    return payload;
  } catch (error) {
    console.error("Error verifying Google token:", error);
    return null;
  }
}

// ---------------save visitor and campaign id--------------------------------
const saveVisitorAndCampaign = async (req, res) => {
  const { visitorId, deviceId, campaignID } = req.body;

  // Validate required inputs
  if (!deviceId || !campaignID) {
    return res.status(400).json({
      error: "Device ID and Campaign ID are required.",
    });
  }

  // Start a database transaction for data integrity
  const transaction = await sequelize.transaction();

  try {
    // Check if the campaign exists
    const campaign = await Campaign.findByPk(campaignID, { transaction });
    if (!campaign) {
      await transaction.rollback();
      return res.status(404).json({
        error: "Campaign not found.",
      });
    }

    // Look for existing users with either deviceId or visitorId
    let existingUser = await EndUser.findOne({
      where: {
        [Op.or]: [
          { deviceId: { [Op.contains]: [deviceId] } },
          ...(visitorId
            ? [{ visitorIds: { [Op.contains]: [visitorId] } }]
            : []),
        ],
      },
      include: [
        {
          model: Campaign,
          as: "campaigns",
          through: {
            where: { campaignID: campaignID },
          },
        },
      ],
      transaction,
    });

    if (existingUser) {
      // Check if user is already associated with the campaign
      if (existingUser.campaigns && existingUser.campaigns.length > 0) {
        await transaction.rollback();
        return res.status(409).json({
          error: "User is already registered for this campaign.",
          user: {
            name: existingUser.name,
            email: existingUser.email,
            countryCode: existingUser.countryCode,
            phone: existingUser.phone,
          },
        });
      }

      // Update existing user's identifiers
      const updateData = {
        deviceId: Array.isArray(existingUser.deviceId)
          ? existingUser.deviceId.includes(deviceId)
            ? existingUser.deviceId
            : [...new Set([...existingUser.deviceId, deviceId])]
          : [deviceId],
        visitorIds:
          Array.isArray(existingUser.visitorIds) && visitorId
            ? existingUser.visitorIds.includes(visitorId)
              ? existingUser.visitorIds
              : [...new Set([...existingUser.visitorIds, visitorId])]
            : visitorId
            ? [visitorId]
            : [],
      };

      // Update user with new identifiers
      await existingUser.update(updateData, { transaction });

      // Associate user with campaign using the junction table
      await existingUser.addCampaign(campaign, { transaction });

      await transaction.commit();

      return res.status(200).json({
        message: "Existing user associated with campaign.",
        user: {
          name: existingUser.name,
          email: existingUser.email,
          countryCode: existingUser.countryCode,
          phone: existingUser.phone,
        },
        campaign: {
          campaignID: campaign.campaignID,
          name: campaign.name,
        },
      });
    }

    // Create new user if no existing user found
    const newUser = await EndUser.create(
      {
        deviceId: [deviceId],
        visitorIds: visitorId ? [visitorId] : [],
      },
      { transaction }
    );

    // Associate new user with campaign using the junction table
    await newUser.addCampaign(campaign, { transaction });

    await transaction.commit();

    return res.status(201).json({
      message: "New user created and associated with campaign.",
      user: {
        name: newUser.name,
        email: newUser.email,
        countryCode: newUser.countryCode,
        phone: newUser.phone,
      },
      campaign: {
        campaignID: campaign.campaignID,
        name: campaign.name,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error saving user and campaign:", error);
    return res.status(500).json({
      error: "An error occurred while saving user and Campaign ID.",
      details: error.message,
    });
  }
};

//  ---------------apple signin---------------------------------
// const appleLogin = asyncHandler(async (req, res, next) => {
//   const transaction = await sequelize.transaction();

//   try {
//     const authHeader = req.headers["authorization"];
//     const idToken = authHeader?.startsWith("Bearer ")
//       ? authHeader.substring(7)
//       : authHeader;
//     const { email, name, appleUserId, visitorId, deviceId, campaignID } =
//       req.body;

//     // Validate required inputs
//     if (!deviceId || !campaignID) {
//       return next(
//         new ErrorHandler("Device ID and Campaign ID are required", 400)
//       );
//     }
//     if (!idToken) {
//       return next(new ErrorHandler("Authorization token is required", 401));
//     }
//     if (!appleUserId) {
//       return next(new ErrorHandler("Apple User ID is required", 400));
//     }

//     // Validate and decode Apple token
//     let decodedToken;
//     try {
//       decodedToken = validateAppleToken(idToken);
//       if (!decodedToken || !decodedToken.sub) {
//         return next(new ErrorHandler("Invalid Apple token", 401));
//       }
//     } catch (tokenError) {
//       return next(new ErrorHandler("Failed to validate Apple token", 401));
//     }

//     // Check if campaign exists
//     const campaign = await Campaign.findByPk(campaignID, { transaction });
//     if (!campaign) {
//       await transaction.rollback();
//       return next(new ErrorHandler("Campaign not found", 404));
//     }

//     // Find existing user by deviceId or visitorId
//     let existingUser = await EndUser.findOne({
//       where: {
//         [Op.or]: [
//           { deviceId: { [Op.contains]: [deviceId] } },
//           ...(visitorId
//             ? [{ visitorIds: { [Op.contains]: [visitorId] } }]
//             : []),
//         ],
//       },
//       include: [
//         {
//           model: Campaign,
//           as: "campaigns",
//           through: {
//             where: { campaignID: campaignID },
//           },
//         },
//       ],
//       transaction,
//     });

//     let user;
//     // Scenario handling
//     if (existingUser) {
//       // Check if user is already registered for this specific campaign
//       if (existingUser.campaigns.length > 0) {
//         if(existingUser.appleUserId==appleUserId){
//           return res.status(200).json({
//             success: false,
//             message: "User already exists with this Apple User ID",
//             data: {
//               user: {
//                 id: existingUser.id,
//                 email: existingUser.email,
//                 name: existingUser.name,
//                 appleUserId: existingUser.appleUserId,
//                 deviceId: existingUser.deviceId,
//                 visitorIds: existingUser.visitorIds,
//                 isEmailVerified: existingUser.isEmailVerified,
//               },
//             },
//           });
//         }
//         // Check if email or name can be updated
//         const canUpdateEmail =
//           !existingUser.email || existingUser.email === null;
//         const canUpdateName = !existingUser.name || existingUser.name === null;

//         if (!canUpdateEmail && !canUpdateName) {
//           await transaction.rollback();
//           return next(
//             new ErrorHandler(
//               "You are already registered for this campaign",
//               400
//             )
//           );
//         }

//         // Prepare updates
//         const updates = {};

//         // Update email if applicable
//         if (canUpdateEmail && email) {
//           updates.email = email.toLowerCase();
//           updates.isEmailVerified = true;
//         } else if (!canUpdateEmail && email) {
//           // If email exists and can't be updated, throw error
//           await transaction.rollback();
//           return next(new ErrorHandler("Email cannot be updated", 400));
//         }

//         // Update name if applicable
//         if (canUpdateName && name) {
//           updates.name = name.trim();
//         } else if (!canUpdateName && name) {
//           // If name exists and can't be updated, throw error
//           await transaction.rollback();
//           return next(new ErrorHandler("Name cannot be updated", 400));
//         }

//         // Update user if there are updates
//         if (Object.keys(updates).length > 0) {
//           await existingUser.update(updates, { transaction });
//         }

//         user = existingUser;
//       } else {
//         // User exists but not registered for this campaign
//         // Update user details
//         const updates = {
//           appleUserId: decodedToken.sub || appleUserId,
//           ...(email && { email: email.toLowerCase(), isEmailVerified: true }),
//           ...(name && { name: name.trim() }),
//           deviceId: [...new Set([...existingUser.deviceId, deviceId])],
//           visitorIds: visitorId
//             ? [...new Set([...existingUser.visitorIds, visitorId])]
//             : existingUser.visitorIds,
//         };

//         await existingUser.update(updates, { transaction });
//         user = existingUser;
//       }

//       // Associate user with campaign if not already associated
//       if (!existingUser.campaigns.length) {
//         await user.addCampaign(campaignID, { transaction });
//       }
//     } else {
//       // New user creation
//       user = await EndUser.create(
//         {
//           appleUserId: decodedToken.sub || appleUserId,
//           email: (decodedToken.email || email)?.trim().toLowerCase(),
//           name: decodedToken.name
//             ? `${decodedToken.name.firstName} ${decodedToken.name.lastName}`.trim()
//             : name?.trim(),
//           authProvider: "apple",
//           deviceId: [deviceId],
//           visitorIds: visitorId ? [visitorId] : [],
//           isEmailVerified: true,
//         },
//         { transaction }
//       );

//       // Associate user with campaign
//       await user.addCampaign(campaignID, { transaction });
//     }

//     // Generate authentication token
//     const tokenPayload = {
//       type: "USER",
//       obj: {
//         id: user.id,
//         email: user.email,
//         name: user.name,
//         appleUserId: user.appleUserId,
//       },
//     };
//     const accessToken = generateToken(tokenPayload);

//     // Commit transaction
//     await transaction.commit();

//     // Return success response
//     return res.status(200).json({
//       success: true,
//       message:
//         user.createdAt === user.updatedAt
//           ? "Signup successful"
//           : "Login successful",
//       data: {
//         user: {
//           id: user.id,
//           email: user.email,
//           name: user.name,
//           appleUserId: user.appleUserId,
//           deviceId: user.deviceId,
//           visitorIds: user.visitorIds,
//           isEmailVerified: user.isEmailVerified,
//         },
//         token: accessToken,
//       },
//     });
//   } catch (error) {
//     await transaction.rollback();
//     console.error("Apple auth error:", error);
//     return next(new ErrorHandler("Authentication failed", error.status || 500));
//   }
// });

const appleLogin = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    console.log("Apple login request received:", req.body);

    const authHeader = req.headers["authorization"];
    const idToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;

    const { email, name, appleUserId, visitorId, deviceId, campaignID } =
      req.body;

    // Validate required inputs
    if (!deviceId || !campaignID) {
      console.error("Validation error: Device ID or Campaign ID is missing");
      return next(
        new ErrorHandler("Device ID and Campaign ID are required", 400)
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

    // Validate and decode Apple token
    let decodedToken;
    try {
      decodedToken = validateAppleToken(idToken);
      if (!decodedToken || !decodedToken.sub) {
        console.error("Apple token validation failed:", decodedToken);
        return next(new ErrorHandler("Invalid Apple token", 401));
      }
      console.log("Decoded Apple token:", decodedToken);
    } catch (tokenError) {
      console.error("Error validating Apple token:", tokenError);
      return next(new ErrorHandler("Failed to validate Apple token", 401));
    }

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
      throw new ErrorHandler("Error fetching campaign", 500);
    }

    let user;
    try {
      user = await EndUser.findOne({
        where: { appleUserId },
        include: [
          {
            model: Campaign,
            as: "campaigns",
            through: {
              where: { campaignID },
            },
          },
        ],
        transaction,
      });

      if (user) {
        // Step 2: If user exists, return the user details
        console.log("User found with Apple User ID:", appleUserId);
        await transaction.commit();
        return res.status(200).json({
          success: true,
          message: "User exists with the provided Apple User ID",
          data: {
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              appleUserId: user.appleUserId,
              deviceId: user.deviceId,
              visitorIds: user.visitorIds,
              isEmailVerified: user.isEmailVerified,
            },
          },
        });
      }
    } catch (fetchError) {
      console.error("Error fetching user by Apple User ID:", fetchError);
      await transaction.rollback();
      throw new ErrorHandler("Error fetching user", 500);
    }

    // Step 3: If no user found, proceed with existing logic
    console.log("No user found with Apple User ID. Proceeding...");
    // Check for existing user
    let existingUser;
    try {
      existingUser = await EndUser.findOne({
        where: {
          [Op.or]: [
            { deviceId: { [Op.contains]: [deviceId] } },
            ...(visitorId
              ? [{ visitorIds: { [Op.contains]: [visitorId] } }]
              : []),
          ],
        },
        include: [
          {
            model: Campaign,
            as: "campaigns",
            through: {
              where: { campaignID: campaignID },
            },
          },
        ],
        transaction,
      });
      console.log(
        "Existing user found:",
        existingUser ? existingUser.id : null
      );
    } catch (userFetchError) {
      console.error("Error fetching existing user:", userFetchError);
      throw new ErrorHandler("Error fetching user", 500);
    }

    // let user;

    try {
      if (existingUser) {
        // Logic for handling existing users
        console.log("Handling existing user logic...");
        if (existingUser.campaigns.length > 0) {
          if (existingUser.appleUserId === appleUserId) {
            console.log("User already registered for this campaign.");
            return res.status(200).json({
              success: false,
              message: "User already exists with this Apple User ID",
              data: {
                user: {
                  id: existingUser.id,
                  email: existingUser.email,
                  name: existingUser.name,
                  appleUserId: existingUser.appleUserId,
                  deviceId: existingUser.deviceId,
                  visitorIds: existingUser.visitorIds,
                  isEmailVerified: existingUser.isEmailVerified,
                },
              },
            });
          }
          // Update email or name if possible
          const canUpdateEmail =
            !existingUser.email || existingUser.email === null;
          const canUpdateName =
            !existingUser.name || existingUser.name === null;

          const updates = {};
          if (canUpdateEmail && email) updates.email = email.toLowerCase();
          if (canUpdateName && name) updates.name = name.trim();

          if (Object.keys(updates).length > 0) {
            await existingUser.update(updates, { transaction });
          }
          user = existingUser;
        } else {
          // Associate user with campaign if not already associated
          const updates = {
            appleUserId: decodedToken.sub || appleUserId,
            ...(email && { email: email.toLowerCase(), isEmailVerified: true }),
            ...(name && { name: name.trim() }),
            deviceId: [...new Set([...existingUser.deviceId, deviceId])],
            visitorIds: visitorId
              ? [...new Set([...existingUser.visitorIds, visitorId])]
              : existingUser.visitorIds,
          };

          await existingUser.update(updates, { transaction });
          user = existingUser;

          if (!existingUser.campaigns.length) {
            await user.addCampaign(campaignID, { transaction });
          }
        }
      } else {
        // Create a new user
        console.log("Creating new user...");
        user = await EndUser.create(
          {
            appleUserId: decodedToken.sub || appleUserId,
            email: (decodedToken.email || email)?.trim().toLowerCase(),
            name: decodedToken.name
              ? `${decodedToken.name.firstName} ${decodedToken.name.lastName}`.trim()
              : name?.trim(),
            authProvider: "apple",
            deviceId: [deviceId],
            visitorIds: visitorId ? [visitorId] : [],
            isEmailVerified: true,
          },
          { transaction }
        );
        await user.addCampaign(campaignID, { transaction });
      }
    } catch (userHandlingError) {
      console.error("Error handling user logic:", userHandlingError);
      throw new ErrorHandler("Error processing user", 500);
    }

    // Generate authentication token
    let accessToken;
    try {
      const tokenPayload = {
        type: "USER",
        obj: {
          id: user.id,
          email: user.email,
          name: user.name,
          appleUserId: user.appleUserId,
        },
      };
      accessToken = generateToken(tokenPayload);
      console.log("Access token generated successfully.");
    } catch (tokenGenerationError) {
      console.error("Error generating token:", tokenGenerationError);
      throw new ErrorHandler("Error generating access token", 500);
    }

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message:
        user.createdAt === user.updatedAt
          ? "Signup successful"
          : "Login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          appleUserId: user.appleUserId,
          deviceId: user.deviceId,
          visitorIds: user.visitorIds,
          isEmailVerified: user.isEmailVerified,
        },
        token: accessToken,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Unhandled error in appleLogin:", error);
    return next(new ErrorHandler("Authentication failed", 500));
  }
});

//----------------Add phone number--------------------------------------------------
const applePhone = asyncHandler(async (req, res, next) => {
  try {
    const { countryCode, phone } = req.body;
    const userId = req.endUser?.id;

    // Input validation
    if (!countryCode) {
      return next(new ErrorHandler("Country code is required", 400));
    }
    if (!phone) {
      return next(new ErrorHandler("Missing phone number", 400));
    }

    if (!userId) {
      return next(new ErrorHandler("Invalid authentication token", 401));
    }

    // Validate phone number
    const phoneValidationResult = phoneValidation.validatePhone(
      countryCode,
      phone
    );

    if (!phoneValidationResult.isValid) {
      return next(new ErrorHandler(phoneValidationResult.message, 400));
    }

    const { formattedPhone } = phoneValidationResult;

    // Find and validate user
    const user = await EndUser.findOne({
      where: { id: userId },
    });

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    if (!user.isEmailVerified) {
      return next(
        new ErrorHandler(
          "Email not verified. Please verify your email first.",
          403
        )
      );
    }

    // Check for duplicate phone number across all users using formatted phone
    const existingPhoneUser = await EndUser.findOne({
      where: {
        phone: formattedPhone,
        id: { [Op.ne]: userId }, // Exclude current user
      },
    });

    if (existingPhoneUser) {
      return next(
        new ErrorHandler(
          "Phone number already registered to another account",
          409
        )
      );
    }

    if (user.phone) {
      return next(
        new ErrorHandler("Phone number already exists for this user", 409)
      );
    }

    // Update phone number with retry logic
    let retries = 3;
    let updateError;

    while (retries > 0) {
      try {
        await user.update({
          phone: formattedPhone, // Store the formatted phone number
        });
        updateError = null;
        break;
      } catch (error) {
        updateError = error;
        retries--;
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retry
        }
      }
    }

    if (updateError) {
      console.error(
        "Failed to update phone number after retries:",
        updateError
      );
      throw updateError;
    }

    // Audit log for phone number update
    console.log(`Phone number updated for user ID: ${user.id}`);

    return res.status(200).json({
      status: true,
      message: "Phone number added successfully",
      user: {
        id: user.id,
        email: user.email,
        phone: formattedPhone,
      },
    });
  } catch (error) {
    console.error("Phone update error:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

//----------------- google signin--------------------------------
const googleLogin = asyncHandler(async (req, res, next) => {
  // Start database transaction
  const transaction = await sequelize.transaction();
  try {
    // Get token and required fields from request
    const authHeader = req.headers["authorization"];
    const idToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;
    const { visitorId, deviceId, campaignID } = req.body;

    // Validate required inputs
    if (!deviceId || !campaignID) {
      return next(
        new ErrorHandler("Device ID and Campaign ID are required", 400)
      );
    }

    if (!idToken || idToken === "null") {
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
    // Check if campaign exists
    const campaign = await Campaign.findByPk(campaignID, { transaction });
    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign not found", 404));
    }

    // Find existing user by deviceId or visitorId
    let existingUser = await EndUser.findOne({
      where: {
        [Op.or]: [
          { deviceId: { [Op.contains]: [deviceId] } },
          ...(visitorId
            ? [{ visitorIds: { [Op.contains]: [visitorId] } }]
            : []),
        ],
      },
      include: [
        {
          model: Campaign,
          as: "campaigns",
          through: {
            where: { campaignID: campaignID },
          },
        },
      ],
      transaction,
    });

    // Check if user is already registered for this specific campaign
    if (existingUser && existingUser.campaigns.length > 0) {
      await transaction.rollback();
      return next(
        new ErrorHandler("You are already registered for this campaign", 400)
      );
    }

    const userEmail = googlePayload.email?.trim().toLowerCase();
    const sanitizedName = googlePayload.name?.trim().replace(/\s+/g, " ");

    // Validate email and name
    if (!userEmail) {
      await transaction.rollback();
      return next(
        new ErrorHandler("Email is required from Google account", 400)
      );
    }
    if (!sanitizedName) {
      await transaction.rollback();
      return next(
        new ErrorHandler("Name is required from Google account", 400)
      );
    }
    if (!isValidEmail(userEmail)) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid email format", 400));
    }
    const nameError = isValidLength(sanitizedName);
    if (nameError) {
      await transaction.rollback();
      return next(new ErrorHandler(nameError, 400));
    }

    let user = await EndUser.findOne({
      where: { googleUserId: googlePayload.sub },
      transaction,
    });

    if (user) {
      // User with this Google ID exists, update the user
      const updates = {
        email: userEmail,
        name: sanitizedName,
        deviceId: [...new Set([...user.deviceId, deviceId])],
        visitorIds: visitorId
          ? [...new Set([...user.visitorIds, visitorId])]
          : user.visitorIds,
        isEmailVerified: true,
      };
      await user.update(updates, { transaction });
    } else {
      // No user with this Google ID, create new user
      user = await EndUser.create(
        {
          googleUserId: googlePayload.sub,
          email: userEmail,
          name: sanitizedName,
          authProvider: "google",
          deviceId: [deviceId],
          visitorIds: visitorId ? [visitorId] : [],
          isEmailVerified: true,
        },
        { transaction }
      );
    }

    // Generate authentication token
    const tokenPayload = {
      type: "USER",
      obj: {
        id: user.id,
        email: user.email,
        name: user.name,
        googleUserId: user.googleUserId,
      },
    };
    const accessToken = generateToken(tokenPayload);

    // Commit transaction
    await transaction.commit();

    // Return success response
    return res.status(200).json({
      success: true,
      message:
        user.createdAt === user.updatedAt
          ? "Signup successful"
          : "Login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          googleUserId: user.googleUserId,
          deviceId: user.deviceId,
          visitorIds: user.visitorIds,
          isEmailVerified: user.isEmailVerified,
        },
        token: accessToken,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Google auth error:", error);
    return next(new ErrorHandler("Authentication failed", error.status || 500));
  }
});

//----------contact us----------------------------
const contactUs = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      name,
      email,
      countryCode,
      phone,
      address,
      otherDetails,
      visitorId,
      deviceId,
      campaignID,
    } = req.body;

    // 1. Input Validation
    // Validate required fields existence
    const requiredFields = ["name", "email", "deviceId", "campaignID"];
    const missingFields = requiredFields.filter((field) => !req.body[field]);
    if (missingFields.length > 0) {
      return next(
        new ErrorHandler(
          `Missing required fields: ${missingFields.join(", ")}`,
          400
        )
      );
    }

    // Check campaign existence
    const campaign = await Campaign.findByPk(campaignID, { transaction });
    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign not found", 404));
    }

    // 2. Input Sanitization
    const sanitizedName = name.trim().replace(/\s+/g, " ");
    const sanitizedEmail = email.trim().toLowerCase();

    // Validate name
    const nameError = isValidLength(sanitizedName);
    if (nameError) {
      await transaction.rollback();
      return next(new ErrorHandler(nameError, 400));
    }

    // Validate email format
    if (!isValidEmail(sanitizedEmail)) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid email", 400));
    }

    // Validate phone if both country code and phone are provided
    let cleanedPhone = null;
    let cleanedCountryCode = null;

    if (phone || countryCode) {
      // If one is provided, both must be provided
      if (!phone || !countryCode) {
        await transaction.rollback();
        return next(
          new ErrorHandler(
            "Both country code and phone number are required",
            400
          )
        );
      }

      const phoneValidationResult = phoneValidation.validatePhone(
        countryCode,
        phone
      );

      if (!phoneValidationResult.isValid) {
        await transaction.rollback();
        return next(new ErrorHandler(phoneValidationResult.message, 400));
      }

      cleanedPhone = phoneValidationResult.cleanedPhone;
      cleanedCountryCode = phoneValidationResult.cleanedCode;
    }

    // Prepare contact info
    const contactInfo = {};
    if (sanitizedName) contactInfo.name = sanitizedName;
    if (sanitizedEmail) contactInfo.email = sanitizedEmail;
    if (cleanedPhone) contactInfo.phone = cleanedPhone;
    if (cleanedCountryCode) contactInfo.countryCode = cleanedCountryCode;

    // Find existing user with deviceId or visitorId
    const whereClause = {
      [Op.or]: [
        { deviceId: { [Op.contains]: [deviceId] } },
        ...(visitorId ? [{ visitorIds: { [Op.contains]: [visitorId] } }] : []),
      ],
    };

    let existingUser = await EndUser.findOne({
      where: whereClause,
      transaction,
      lock: true,
    });

    let user;
    let isNew = false;

    if (existingUser) {
      // Check if user already has this campaign
      const hasCampaign = await existingUser.hasCampaign(campaignID, {
        transaction,
      });

      if (hasCampaign) {
        // Update existing user for the same campaign
        const updatedFields = {
          contactInfo: {
            ...(existingUser.contactInfo || {}),
            ...contactInfo,
          },
          address: address || existingUser.address,
          otherDetails: otherDetails || existingUser.otherDetails,
        };

        // Safely handle deviceId and visitorIds as arrays
        const updatedDeviceIds = [
          ...new Set([
            ...(Array.isArray(existingUser.deviceId)
              ? existingUser.deviceId
              : []),
            deviceId,
          ]),
        ];
        const updatedVisitorIds = visitorId
          ? [
              ...new Set([
                ...(Array.isArray(existingUser.visitorIds)
                  ? existingUser.visitorIds
                  : []),
                visitorId,
              ]),
            ]
          : existingUser.visitorIds;

        await existingUser.update(
          {
            ...updatedFields,
            deviceId: updatedDeviceIds,
            visitorIds: updatedVisitorIds,
            updatedAt: new Date(),
          },
          { transaction }
        );
        user = existingUser;
      } else {
        // Create a new user entry for the new campaign
        user = await EndUser.create(
          {
            contactInfo,
            phone: cleanedPhone,
            countryCode: cleanedCountryCode,
            deviceId: [deviceId],
            visitorIds: visitorId ? [visitorId] : [],
            address: address,
            otherDetails: otherDetails,
            authProvider: "local",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          { transaction }
        );
        isNew = true;
      }
    } else {
      // Create new user if no existing user found
      user = await EndUser.create(
        {
          contactInfo,
          phone: cleanedPhone,
          countryCode: cleanedCountryCode,
          deviceId: [deviceId],
          visitorIds: visitorId ? [visitorId] : [],
          address: address,
          otherDetails: otherDetails,
          authProvider: "local",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { transaction }
      );
      isNew = true;
    }

    // Associate user with campaign
    await user.addCampaign(campaignID, { transaction });

    // 4. Response Handling
    const userData = await EndUser.findByPk(user.id, {
      attributes: [
        "id",
        "name",
        "email",
        "countryCode",
        "phone",
        "address",
        "otherDetails",
        "visitorIds",
        "deviceId",
        "appleUserId",
        "googleUserId",
        "isEmailVerified",
        "authProvider",
        "isInterestedProducts",
        "contactInfo",
        "createdAt",
      ],
      transaction,
    });

    // Commit transaction
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: isNew
        ? "New Contact Us Form Submitted successfully"
        : "Contact Us Form updated/submitted successfully",
      data: userData,
    });
  } catch (error) {
    // Rollback transaction in case of error
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

//----------------get user by token-------------------------------------
const getUserByToken = asyncHandler(async (req, res, next) => {
  try {
    const id = req.user?.id;
    const user = await EndUser.findByPk(id, {
      attributes: [
        "id",
        "name",
        "email",
        "countryCode",
        "phone",
        "address",
        "otherDetails",
        "createdAt",
      ],
    });
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    } else {
      return res.status(200).json({ success: true, data: user });
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// ----isInterestedProducts--------------------------------
const updateInterestedProduct = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { visitorId, deviceId, productName, campaignID } = req.body;

    // Validate required inputs
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "Device ID is required",
      });
    }

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name is required",
      });
    }

    if (!campaignID) {
      return res.status(400).json({
        success: false,
        message: "Campaign ID is required",
      });
    }

    // Check if campaign exists
    const campaign = await Campaign.findByPk(campaignID, { transaction });
    if (!campaign) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    // Build the query condition based on provided ID
    const whereCondition = {
      deviceId: { [Op.contains]: [deviceId] },
      ...(visitorId
        ? {
            [Op.or]: [{ visitorIds: { [Op.contains]: [visitorId] } }],
          }
        : {}),
    };

    // Find the user
    const user = await EndUser.findOne({
      where: whereCondition,
      include: [
        {
          model: Campaign,
          as: "campaigns",
          through: {
            where: { campaignID: campaignID },
          },
        },
      ],
      transaction,
    });

    // Check if user is registered for this specific campaign
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user is already registered for this campaign
    if (user.campaigns.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "You are not registered for this campaign",
      });
    }

    // Get current interested products array or initialize if null
    let currentProducts = user.isInterestedProducts || [];

    // Check if product name already exists
    if (currentProducts.includes(productName)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `You have already shown interest in this product: ${productName}`,
      });
    }

    // Update the array with the new product name
    const updatedProducts = [...currentProducts, productName];

    // Update the user record
    await user.update(
      {
        isInterestedProducts: updatedProducts,
        ...(visitorId && !user.visitorIds.includes(visitorId)
          ? { visitorIds: [...new Set([...user.visitorIds, visitorId])] }
          : {}),
      },
      { transaction }
    );

    // Commit transaction
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Product interest updated successfully",
      data: {
        isInterestedProduct: updatedProducts,
      },
    });
  } catch (error) {
    // Rollback transaction in case of error
    await transaction.rollback();
    console.error("Error updating product interest:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
//--------------------Update user-----------------------------
const updateUser = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(new ErrorHandler("User ID is required", 400));
    }

    // Parse JSON data if it's a string
    let bodyData = req.body.data
      ? typeof req.body.data === "string"
        ? JSON.parse(req.body.data)
        : req.body.data
      : req.body;

    // Validation checks
    if (
      bodyData.professionalEmail &&
      (typeof bodyData.professionalEmail !== "string" ||
        bodyData.professionalEmail.toLowerCase().trim() === "")
    ) {
      return next(new ErrorHandler("Please provide a valid email", 400));
    }
    if (
      bodyData.name &&
      (typeof bodyData.name !== "string" || bodyData.name.trim() === "")
    ) {
      return next(new ErrorHandler("Please provide a valid name", 400));
    }

    if (bodyData.address && typeof bodyData.address !== "object") {
      return next(new ErrorHandler("Address must be a valid object", 400));
    }

    if (bodyData.userWebsites) {
      if (!Array.isArray(bodyData.userWebsites)) {
        return next(new ErrorHandler("User websites must be an array", 400));
      }
    }

    if (
      bodyData.companyWebsite &&
      (typeof bodyData.companyWebsite !== "string" ||
        bodyData.companyWebsite.trim() === "")
    ) {
      return next(new ErrorHandler("Company website must be a valid URL", 400));
    }

    // Get current user data
    const currentUser = await User.findByPk(userId);
    if (!currentUser) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Prepare update data
    let updateData = {
      updatedAt: new Date(),
    };

    // Handle name update
    if (bodyData.name) {
      const newName = bodyData.name.trim().replace(/\s+/g, " ");
      const nameError = isValidLength(newName);
      if (nameError) {
        return next(new ErrorHandler(nameError, 400));
      }
      updateData.name = newName;
    }
    // Handle professionalEmail update
    if (bodyData.professionalEmail) {
      const newEmail = bodyData.professionalEmail.toLowerCase().trim();
      const emailError = isValidEmail(newEmail);
      if (emailError) {
        return next(new ErrorHandler("Invalid Email", 400));
      }
      updateData.professionalEmail = newEmail;
    }
    // Handle userImages - REPLACE instead of append
    if (req.files?.userImages) {
      const fileError = validateFiles(req.files.userImages, "user images");
      if (fileError) {
        return next(new ErrorHandler(fileError, 400));
      }

      // Delete existing user images from CDN
      let currentUserImages = [];
      try {
        currentUserImages =
          typeof currentUser.userImages === "string"
            ? JSON.parse(currentUser.userImages)
            : currentUser.userImages || [];

        // Delete existing images from CDN
        await Promise.all(
          currentUserImages.map((img) => deleteFile(img.fileName))
        );
      } catch (error) {
        console.error("Error parsing or deleting current userImages:", error);
      }

      // Upload new images
      const newUserImages = [];
      for (const file of req.files.userImages) {
        try {
          const uploadResult = await uploadFile(file);
          newUserImages.push({
            fileName: uploadResult.filename,
            originalName: file.originalname,
            fileType: file.mimetype,
            fileSize: file.size,
            cdnUrl: uploadResult.url,
            uploadedAt: new Date().toISOString(),
          });
        } catch (uploadError) {
          console.error(
            `Error uploading user image ${file.originalname}:`,
            uploadError
          );
          continue;
        }
      }

      updateData.userImages = newUserImages;
    }

    // Handle companyImages - REPLACE instead of append
    if (req.files?.companyImages) {
      const fileError = validateFiles(
        req.files.companyImages,
        "company images"
      );
      if (fileError) {
        return next(new ErrorHandler(fileError, 400));
      }

      // Delete existing company images from CDN
      let currentCompanyImages = [];
      try {
        currentCompanyImages =
          typeof currentUser.companyImages === "string"
            ? JSON.parse(currentUser.companyImages)
            : currentUser.companyImages || [];

        // Delete existing images from CDN
        await Promise.all(
          currentCompanyImages.map((img) => deleteFile(img.fileName))
        );
      } catch (error) {
        console.error(
          "Error parsing or deleting current companyImages:",
          error
        );
      }

      // Upload new images
      const newCompanyImages = [];
      for (const file of req.files.companyImages) {
        try {
          const uploadResult = await uploadFile(file);
          newCompanyImages.push({
            fileName: uploadResult.filename,
            originalName: file.originalname,
            fileType: file.mimetype,
            fileSize: file.size,
            cdnUrl: uploadResult.url,
            uploadedAt: new Date().toISOString(),
          });
        } catch (uploadError) {
          console.error(
            `Error uploading company image ${file.originalname}:`,
            uploadError
          );
          continue;
        }
      }

      updateData.companyImages = newCompanyImages;
    }

    // Handle other fields
    if (bodyData.address) {
      updateData.address = bodyData.address;
    }
    if (bodyData.userWebsites) {
      updateData.userWebsites = bodyData.userWebsites;
    }
    if (bodyData.companyWebsite) {
      updateData.companyWebsite = bodyData.companyWebsite;
    }

    // Update user in database
    const [num, [updatedUser]] = await User.update(updateData, {
      where: { id: userId },
      returning: true,
    });

    if (num === 0) {
      return next(
        new ErrorHandler(`Failed to update user with id=${userId}`, 404)
      );
    }

    // Return success response
    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.professionalEmail,
        phone: updatedUser.phone,
        userImages: updatedUser.userImages,
        companyImages: updatedUser.companyImages,
        address: updatedUser.address,
        userWebsites: updatedUser.userWebsites,
        companyWebsite: updatedUser.companyWebsite,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update User Error:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});
//-----------------delete user--------------------------
const deleteUser = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(new ErrorHandler("Missing User Id", 400));
    }
    const user = await User.findOne({ where: { id: userId } });
    // console.log(user);
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }
    await user.destroy();
    return res.status(200).send({
      success: true,
      message: `user with email (${user.email}) deleted successfully`,
    });
  } catch (err) {
    return next(new ErrorHandler(err.message, 500));
  }
});

module.exports = {
  saveVisitorAndCampaign,
  appleLogin,
  applePhone,
  googleLogin,
  updateInterestedProduct,
  contactUs,
  getUserByToken,
};
