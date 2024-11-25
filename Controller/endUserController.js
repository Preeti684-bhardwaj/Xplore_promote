const db = require("../dbConfig/dbConfig.js");
const EndUser = db.endUsers;
const Campaign = db.campaigns;
const {Op } = require("sequelize");
const sequelize = db.sequelize;
const { phoneValidation } = require("../utils/phoneValidation.js");
const {
  isValidEmail,
  isValidLength,
} = require("../validators/validation.js");
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
const { OAuth2Client } = require('google-auth-library');
const {ENDUSER_CLIENT_ID} = process.env
const googleClient = new OAuth2Client({
  clientId: ENDUSER_CLIENT_ID
});

async function verifyGoogleLogin(idToken) {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: ENDUSER_CLIENT_ID
  });
  const payload = ticket.getPayload();
  return payload
  } catch (error) {
    console.error("Error verifying Google token:", error);
    return null;
  }
}

// ---------------save visitor and campaign id--------------------------------
const saveVisitorAndCampaign = async (req, res) => {
  const { visitorId, deviceId, campaignID } = req.body; // Extract visitor ID from request body
 // Check if either visitorId or deviceId is provided
 if ((!visitorId && !deviceId) || !campaignID) {
  return res.status(400).json({
    error: 'Either Visitor ID or Device ID, and Campaign ID are required.',
  });
}
  try {
    // Check if the campaign exists
    const campaign = await Campaign.findByPk(campaignID);
    if (!campaign) {
      return res.status(404).json({
        error: 'Campaign not found.',
      });
    }

    let existingUser;
    const identifierToUse = visitorId || deviceId;
    const identifierType = visitorId ? 'visitorIds' : 'deviceIds';

    // Check if the user exists with either visitorId or deviceId
    if (visitorId) {
      existingUser = await EndUser.findOne({
        where: { visitorIds: { [Op.contains]: [visitorId] } },
      });
    } else {
      existingUser = await EndUser.findOne({
        where: { deviceIds: { [Op.contains]: [deviceId] } },
      });
    }

    if (existingUser) {
      // If using a new type of ID that this user doesn't have yet, add it to their record
      if (!existingUser[identifierType].includes(identifierToUse)) {
        const updatedIds = [...existingUser[identifierType], identifierToUse];
        await existingUser.update({
          [identifierType]: updatedIds
        });
      }

      // Update the campaign with the existing user's ID
      await Campaign.update(
        { userID: existingUser.id },
        { where: { id: campaignID } }
      );

      return res.status(200).json({
        message: 'Campaign updated with existing user ID.',
        user: existingUser,
        campaign: await Campaign.findByPk(campaignID)
      });
    }

    // If no existing user found, create a new user
    const newUser = await EndUser.create({
      visitorIds: visitorId ? [visitorId] : [],
      deviceIds: deviceId ? [deviceId] : [],
    });

    // Update the campaign with the new user's ID
    await Campaign.update(
      { userID: newUser.id },
      { where: { id: campaignID } }
    );

    // Fetch the updated campaign
    const updatedCampaign = await Campaign.findByPk(campaignID);

    return res.status(201).json({
      message: 'New user created and campaign updated successfully.',
      user: newUser,
      campaign: updatedCampaign
    });

  } catch (error) {
    console.error('Error saving user and campaign:', error);
    return res.status(500).json({
      error: 'An error occurred while saving user and Campaign ID.',
      details: error.message
    });
  }
};
//  ---------------apple signin---------------------------------
const appleLogin = asyncHandler(async (req, res, next) => {
  // Start database transaction
  const transaction = await sequelize.transaction();

  try {
    const authHeader = req.headers["authorization"];
    const idToken = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;
    const { email, name, appleUserId, visitorId, deviceId } = req.body;

    // Validate required inputs
    if (!visitorId && !deviceId) {
      return next(
        new ErrorHandler("Either visitor ID or device ID is required", 400)
      );
    }
    if (!idToken) {
      return next(new ErrorHandler("Authorization token is required", 401));
    }
    if (!appleUserId) {
      return next(new ErrorHandler("Apple User ID is required", 400));
    }

    // Validate and decode Apple token
    let decodedToken;
    try {
      decodedToken = validateAppleToken(idToken);
      if (!decodedToken || !decodedToken.sub) {
        return next(new ErrorHandler("Invalid Apple token", 401));
      }
    } catch (tokenError) {
      return next(new ErrorHandler("Failed to validate Apple token", 401));
    }

    // Build the where clause based on provided IDs
    const whereClause = [];
    if (deviceId) {
      whereClause.push({ deviceId: { [Op.contains]: [deviceId] } });
    }
    if (visitorId) {
      whereClause.push({ visitorIds: { [Op.contains]: [visitorId] } });
    }

    // Find user by deviceId or visitorId
    let user = await EndUser.findOne({
      where: {
        [Op.or]: whereClause,
      },
      transaction,
    });

    // If user found by device/visitor ID, update with Apple credentials
    if (user) {
      const updates = {
        appleUserId: decodedToken.sub || appleUserId,
        email: (decodedToken.email || email)?.toLowerCase(),
        name: decodedToken.name
          ? `${decodedToken.name.firstName} ${decodedToken.name.lastName}`.trim()
          : name?.trim(),
        authProvider: "apple",
        isEmailVerified: true,
      };

      // Validate email if provided
      if (updates.email && !isValidEmail(updates.email)) {
        await transaction.rollback();
        return next(new ErrorHandler("Invalid email format", 400));
      }

      // Validate name if provided
      if (updates.name) {
        const sanitizedName = updates.name.replace(/\s+/g, " ");
        const nameError = isValidLength(sanitizedName);
        if (nameError) {
          await transaction.rollback();
          return next(new ErrorHandler(nameError, 400));
        }
        updates.name = sanitizedName;
      }

      await user.update(updates, { transaction });
    } else {
      // If no user found by device/visitor ID, try finding by appleUserId
      user = await EndUser.findOne({
        where: { appleUserId: decodedToken.sub || appleUserId },
        transaction,
      });

      if (user) {
        // Existing Apple user - add new device/visitor ID
        const updates = {
          deviceId: deviceId
            ? [...new Set([...user.deviceId, deviceId])]
            : user.deviceId,
          visitorIds: visitorId
            ? [...new Set([...user.visitorIds, visitorId])]
            : user.visitorIds,
            isEmailVerified: true,
        };
        await user.update(updates, { transaction });
      } else {
        // New user - create account
        if (!email && !decodedToken.email) {
          await transaction.rollback();
          return next(new ErrorHandler("Email is required for new users", 400));
        }

        if (!name && !decodedToken.name) {
          await transaction.rollback();
          return next(new ErrorHandler("Name is required for new users", 400));
        }

        const userEmail = (decodedToken.email || email).trim().toLowerCase();
        if (!isValidEmail(userEmail)) {
          await transaction.rollback();
          return next(new ErrorHandler("Invalid email format", 400));
        }

        const userName = decodedToken.name
          ? `${decodedToken.name.firstName} ${decodedToken.name.lastName}`.trim()
          : name.trim();
        const sanitizedName = userName.replace(/\s+/g, " ");

        const nameError = isValidLength(sanitizedName);
        if (nameError) {
          await transaction.rollback();
          return next(new ErrorHandler(nameError, 400));
        }

        try {
          user = await EndUser.create(
            {
              appleUserId: decodedToken.sub || appleUserId,
              email: userEmail,
              name: sanitizedName,
              authProvider: "apple",
              deviceId: [deviceId],
              visitorIds: [visitorId],
              isEmailVerified: true,
            },
            { transaction }
          );
        } catch (dbError) {
          await transaction.rollback();
          if (dbError.name === "SequelizeUniqueConstraintError") {
            return next(
              new ErrorHandler(
                "Email already registered with another account",
                409
              )
            );
          }
          throw dbError;
        }
      }
    }

    // Generate authentication token
    const tokenPayload = {
      type: "USER",
      obj: {
        id: user.id,
        email: user.email,
        name: user.name,
        appleUserId: user.appleUserId,
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
    console.error("Apple auth error:", error);
    return next(new ErrorHandler("Authentication failed", error.status || 500));
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
        console.error("Failed to update phone number after retries:", updateError);
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
    const idToken = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;
    const { visitorId, deviceId } = req.body;

    // Validate required inputs
    if (!visitorId && !deviceId) {
      return next(new ErrorHandler("Either visitor ID or device ID is required", 400));
    }
    if (!idToken || idToken === "null") {
      return next(new ErrorHandler("Authorization token is required", 401));
    }

    // Verify Google token
    let googlePayload;
    try {
      googlePayload = await verifyGoogleLogin(idToken);
      if (!googlePayload?.sub) {
        return next(new ErrorHandler("Invalid Google account information", 400));
      }
    } catch (error) {
      if (error.message.includes('Token used too late')) {
        return next(new ErrorHandler("Authentication token has expired. Please login again.", 401));
      }
      return next(new ErrorHandler("Failed to validate Google token", 401));
    }

    // Build the where clause based on provided IDs
    const whereClause = [];
    if (deviceId) {
      whereClause.push({ deviceId: { [Op.contains]: [deviceId] } });
    }
    if (visitorId) {
      whereClause.push({ visitorIds: { [Op.contains]: [visitorId] } });
    }

    // Find user by deviceId or visitorId
    let user = await EndUser.findOne({
      where: {
        [Op.or]: whereClause,
      },
      transaction,
    });

    // If user found by device/visitor ID, update with Google credentials
    if (user) {
      const updates = {
        googleUserId: googlePayload.sub,
        email: googlePayload.email?.toLowerCase(),
        name: googlePayload.name?.trim(),
        authProvider: "google",
        isEmailVerified: true,
      };

      // Validate email if provided
      if (updates.email && !isValidEmail(updates.email)) {
        await transaction.rollback();
        return next(new ErrorHandler("Invalid email format", 400));
      }

      // Validate name if provided
      if (updates.name) {
        const sanitizedName = updates.name.replace(/\s+/g, " ");
        const nameError = isValidLength(sanitizedName);
        if (nameError) {
          await transaction.rollback();
          return next(new ErrorHandler(nameError, 400));
        }
        updates.name = sanitizedName;
      }

      await user.update(updates, { transaction });
    } else {
      // If no user found by device/visitor ID, try finding by googleUserId
      user = await EndUser.findOne({
        where: { googleUserId: googlePayload.sub },
        transaction,
      });

      if (user) {
        // Existing Google user - add new device/visitor ID
        const updates = {
          deviceId: deviceId
            ? [...new Set([...user.deviceId, deviceId])]
            : user.deviceId,
          visitorIds: visitorId
            ? [...new Set([...user.visitorIds, visitorId])]
            : user.visitorIds,
          isEmailVerified: true,
        };
        await user.update(updates, { transaction });
      } else {
        // New user - create account
        if (!googlePayload.email) {
          await transaction.rollback();
          return next(new ErrorHandler("Email is required from Google account", 400));
        }

        if (!googlePayload.name) {
          await transaction.rollback();
          return next(new ErrorHandler("Name is required from Google account", 400));
        }

        const userEmail = googlePayload.email.trim().toLowerCase();
        if (!isValidEmail(userEmail)) {
          await transaction.rollback();
          return next(new ErrorHandler("Invalid email format", 400));
        }

        const sanitizedName = googlePayload.name.trim().replace(/\s+/g, " ");
        const nameError = isValidLength(sanitizedName);
        if (nameError) {
          await transaction.rollback();
          return next(new ErrorHandler(nameError, 400));
        }

        try {
          user = await EndUser.create(
            {
              googleUserId: googlePayload.sub,
              email: userEmail,
              name: sanitizedName,
              authProvider: "google",
              deviceId: deviceId ? [deviceId] : [],
              visitorIds: visitorId ? [visitorId] : [],
              isEmailVerified: true,
            },
            { transaction }
          );
        } catch (dbError) {
          await transaction.rollback();
          if (dbError.name === "SequelizeUniqueConstraintError") {
            return next(new ErrorHandler("Email already registered with another account", 409));
          }
          throw dbError;
        }
      }
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
      message: user.createdAt === user.updatedAt ? "Signup successful" : "Login successful",
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
  try {
    const {
      name,
      countryCode,
      phone,
      email,
      address,
      otherDetails,
      visitorId,
      deviceId,
    } = req.body;
    // 1. Input Validation
    // Validate required fields existence
    const requiredFields = ["name", "email"];
    const missingFields = requiredFields.filter((field) => !req.body[field]);
    if (missingFields.length > 0) {
      return next(
        new ErrorHandler(
          `Missing required fields: ${missingFields.join(", ")}`,
          400
        )
      );
    }
    if(!visitorId && !deviceId){
      return next(new ErrorHandler("Either Visitor ID or Device ID required", 400));
    }

    // 2. Input Sanitization
    const sanitizedName = name.trim().replace(/\s+/g, " ");
    const sanitizedEmail = email.trim().toLowerCase();

    // Validate name
    const nameError = isValidLength(sanitizedName);
    if (nameError) {
      return next(new ErrorHandler(nameError, 400));
    }
    // Validate email format
    if (!isValidEmail(sanitizedEmail)) {
      return next(new ErrorHandler("Invalid email", 400));
    }

    // Validate phone if both country code and phone are provided
    let cleanedPhone = null;
    let cleanedCountryCode = null;

    if (phone || countryCode) {
      // If one is provided, both must be provided
      if (!phone || !countryCode) {
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
        return next(new ErrorHandler(phoneValidationResult.message, 400));
      }

      cleanedPhone = phoneValidationResult.cleanedPhone;
      cleanedCountryCode = phoneValidationResult.cleanedCode;
    }

    // 7. Database operations with transaction
    const result = await sequelize.transaction(async (t) => {
      // Check for existing user with proper indexing
      const whereClause = {
        [Op.or]: [
          { deviceId: { [Op.contains]: [deviceId] } },
          { visitorIds: { [Op.contains]: [visitorId] } },
        ],
      };
      let existingUser = await EndUser.findOne({
        where: whereClause,
        transaction: t,
        lock: true,
      });

      if (existingUser) {
        // Update only fields that are empty or not set
        const updatedFields = {
          name: existingUser.name || sanitizedName,
          email: existingUser.email || sanitizedEmail,
          phone: existingUser.phone || cleanedPhone,
          countryCode: existingUser.countryCode || cleanedCountryCode,
          address: existingUser.address || address,
          otherDetails: existingUser.otherDetails || otherDetails,
        };

        // Safely handle deviceId and visitorIds as arrays
        const updatedDeviceIds = [
          ...new Set([...(Array.isArray(existingUser.deviceId) ? existingUser.deviceId : []), deviceId]),
        ];
        const updatedVisitorIds = [
          ...new Set([...(Array.isArray(existingUser.visitorIds) ? existingUser.visitorIds : []), visitorId]),
        ];

        await existingUser.update(
          {
            ...updatedFields,
            deviceId: updatedDeviceIds,
            visitorIds: updatedVisitorIds,
            updatedAt: new Date(),
          },
          { transaction: t }
        );
        return {
          user: existingUser,
          isNew: false,
        };
      }

      // Create new user if none exists
      const newUser = await EndUser.create(
        {
          name: sanitizedName,
          email: sanitizedEmail,
          phone: cleanedPhone,
          countryCode: cleanedCountryCode,
          deviceId: [deviceId],
          visitorIds: [visitorId],
          address: address?.trim(),
          otherDetails,
          authProvider: "local",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { transaction: t }
      );

      return {
        user: newUser,
        isNew: true,
      };
    });

    // 4. Response Handling
    const userData = await EndUser.findByPk(result.user.id, {
      attributes: ["id", "name", "email", "phone", "countryCode", "createdAt"],
    });

    return res.status(200).json({
      success: true,
      message: result.isNew
        ? "New Contact Us Form Submitted successfully"
        : "Contact Us Form updated/submitted successfully",
      data: userData,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//----------------get user by token-------------------------------------
const getUserByToken = asyncHandler(async (req, res, next) => {
  try {
    const id = req.user?.id;
    const user = await EndUser.findByPk(id, {
        attributes: ["id", "name", "email","countryCode","phone","address","otherDetails", "createdAt"],
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
  try {
      const { visitorId, deviceId, productName } = req.body;

      if (!productName) {
          return res.status(400).json({
              success: false,
              message: 'Product name is required'
          });
      }

      if (!visitorId && !deviceId) {
          return res.status(400).json({
              success: false,
              message: 'Either visitorId or deviceId is required'
          });
      }

      // Build the query condition based on provided ID
      const whereCondition = {
          [Op.or]: []
      };

      if (visitorId) {
          whereCondition[Op.or].push({
              visitorIds: {
                  [Op.contains]: [visitorId]
              }
          });
      }

      if (deviceId) {
          whereCondition[Op.or].push({
              deviceId: {
                  [Op.contains]: [deviceId]
              }
          });
      }

      // Find the user
      const user = await EndUser.findOne({
          where: whereCondition
      });

      if (!user) {
          return res.status(404).json({
              success: false,
              message: 'User not found'
          });
      }

      // Get current interested products array or initialize if null
      let currentProducts = user.isInterestedProducts || [];

        // Check if product name already exists
        if (currentProducts.includes(productName)) {
          return res.status(400).json({
              success: false,
              message: `You have already shown interest in this product: ${productName}`
          });
      }

      // Check if product name already exists
      if (!currentProducts.includes(productName)) {
          // Update the array with the new product name
          const updatedProducts = [...currentProducts, productName];

          // Update the user record
          await user.update({
            isInterestedProducts: updatedProducts
          });
          console.log('Updated user:', user);
          return res.status(200).json({
              success: true,
              message: 'Product interest updated successfully',
              data: {
                  isInterestedProduct: updatedProducts
              }
          });
      }

      return res.status(200).json({
          success: true,
          message: 'Product already exists in interests',
          data: {
              isInterestedProduct: currentProducts
          }
      });

  } catch (error) {
      console.error('Error updating product interest:', error);
      return res.status(500).json({
          success: false,
          message: 'Internal server error',
          error: error.message
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
