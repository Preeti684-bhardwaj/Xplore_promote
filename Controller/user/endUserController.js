const db = require("../../dbConfig/dbConfig.js");
const sequelize = db.sequelize;
const { Op } = require("sequelize");
const Enduser = db.endUsers;
const Campaign = db.campaigns;
const SmsConfig = db.smsConfig;
const jwt = require("jsonwebtoken");
const axios = require("axios");
require("dotenv").config();
const { isValidEmail } = require("../../validators/validation.js");
const { CLIENT_ID, ANDROID_ENDUSER_CLIENT_ID, WEB_ENDUSER_CLIENT_ID } =
  process.env;
const { OAuth2Client } = require("google-auth-library");
const ErrorHandler = require("../../utils/ErrorHandler.js");
const asyncHandler = require("../../utils/asyncHandler.js");
const { phoneValidation } = require("../../utils/phoneValidation.js");

const googleClient = new OAuth2Client({
  clientId: CLIENT_ID || ANDROID_ENDUSER_CLIENT_ID || WEB_ENDUSER_CLIENT_ID,
});

// Helper function to get SMS configuration for a campaign
const getSmsConfigForCampaign = async (campaignId, transaction) => {
  // Try to find campaign-specific configuration first
  let smsConfig = await SmsConfig.findOne({
    where: { campaignId },
    transaction,
  });

  if (!smsConfig) {
    // If no campaign-specific config exists, get the campaign to find the user (brand)
    const campaign = await Campaign.findOne({
      where: { campaignID: campaignId },
      transaction,
    });

    if (!campaign) {
      throw new ErrorHandler("Campaign not found", 404);
    }

    // Look for user/brand level configuration
    smsConfig = await SmsConfig.findOne({
      where: { userId: campaign.createdBy },
      transaction,
    });

    if (!smsConfig) {
      throw new ErrorHandler("SMS configuration not found for this campaign", 400);
    }
  }

  return {
    baseURL: smsConfig.base_url,
    apiKey: smsConfig.api_key,
    flowId: smsConfig.otherDetails?.flow_id,
    phoneFlowId: smsConfig.account_id,
    provider: smsConfig.provider,
  };
};

const validateAppleToken = (idToken) => {
  if (!idToken || idToken === "null") {
    return {
      success: false,
      status: 401,
      message: "No idToken provided",
    };
  }

  try {
    const decodedToken = jwt.decode(idToken);
    console.log(decodedToken);

    if (!decodedToken || !decodedToken.sub) {
      return {
        success: false,
        status: 400,
        message: "Invalid token payload",
      };
    }
    return decodedToken;
  } catch (error) {
    console.error("Token validation error:", error);
    return {
      success: false,
      status: 500,
      message: error.message || "Invalid identity token",
    };
  }
};

const verifyGoogleLogin = async (idToken) => {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: [CLIENT_ID, ANDROID_ENDUSER_CLIENT_ID, WEB_ENDUSER_CLIENT_ID],
    });

    const payload = ticket.getPayload();
    console.log("Full token payload:", JSON.stringify(payload, null, 2));
    console.log("Token audience:", payload.aud);

    return payload;
  } catch (error) {
    console.error("Detailed error verifying Google token:", {
      message: error.message,
      stack: error.stack,
    });
    return null;
  }
};

//----------send phone otp----------------------------
const sendPhoneOtp = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { countryCode, phone, campaignId } = req.body;

    // Validate required fields
    if (!phone || !countryCode) {
      await transaction.rollback();
      return next(
        new ErrorHandler("Both country code and phone number are required", 400)
      );
    }

    if (!campaignId) {
      await transaction.rollback();
      return next(new ErrorHandler("missing campaignId", 400));
    }

    // Find the campaign by campaignID
    const campaign = await db.campaigns.findOne({
      where: { campaignID: campaignId },
      transaction,
    });

    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid campaign id", 400));
    }

    // Get SMS configuration for this campaign
    const SMS_CONFIG = await getSmsConfigForCampaign(campaignId, transaction);

    // Phone validation
    const phoneValidationResult = phoneValidation.validatePhone(
      countryCode,
      phone
    );

    if (!phoneValidationResult.isValid) {
      await transaction.rollback();
      return next(new ErrorHandler(phoneValidationResult.message, 400));
    }

    const cleanedPhone = phoneValidationResult.cleanedPhone;
    const cleanedCountryCode = phoneValidationResult.cleanedCode;

    // Rate limiting check
    const user = await Enduser.findOne({
      where: { countryCode: cleanedCountryCode, phone: cleanedPhone },
      transaction,
    });

    if (user && user.lastOtpSentAt) {
      const timeDiff = Date.now() - user.lastOtpSentAt;
      if (timeDiff < 60000) {
        // 1 minute cooldown
        await transaction.rollback();
        return next(
          new ErrorHandler("Please wait before requesting another OTP", 429)
        );
      }
    }

    // Construct full phone number
    const fullPhoneNumber = `+${cleanedCountryCode}${cleanedPhone}`;

    try {
      // Call SMS Provider API to send OTP (using config)
      const response = await axios({
        method: "post",
        url: `${SMS_CONFIG.baseURL}/verify`,
        headers: {
          "Content-Type": "application/json",
          "api-key": SMS_CONFIG.apiKey,
        },
        data: {
          flow_id: SMS_CONFIG.phoneFlowId,
          to: {
            mobile: fullPhoneNumber,
          },
        },
      });

      const verifyId = response.data.data.verify_id;
      const expireTime = Date.now() + 5 * 60 * 1000; // 5 minutes

      if (!user) {
        // Create new user if not exists
        await Enduser.create(
          {
            countryCode: cleanedCountryCode,
            phone: cleanedPhone,
            otp: verifyId,
            otpExpire: expireTime,
            lastOtpSentAt: Date.now(),
            otpAttempts: 0,
            authProvider: "sms",
          },
          { transaction }
        );
      } else {
        // Update existing user
        user.otp = verifyId;
        user.otpExpire = expireTime;
        user.lastOtpSentAt = Date.now();
        user.otpAttempts = 0;
        await user.save({ transaction });
      }

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: "OTP sent successfully",
        data: {
          phone: fullPhoneNumber,
        },
      });
    } catch (error) {
      // Handle SMS API errors
      if (error.response?.data?.error) {
        const smsError = error.response.data.error;
        await transaction.rollback();
        return next(new ErrorHandler(smsError.message, 400));
      }
      throw error;
    }
  } catch (error) {
    await transaction.rollback();
    console.error("Error sending SMS OTP:", error);
    return next(
      new ErrorHandler(
        error.response?.data?.message || "Failed to send OTP",
        error.response?.status || 500
      )
    );
  }
});

//----------phone verification----------------------------
const phoneVerification = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { countryCode, phone, otp, campaignId } = req.body;

    if (!otp?.trim()) {
      await transaction.rollback();
      return next(new ErrorHandler("OTP is required", 400));
    }

    if (!phone || !countryCode) {
      await transaction.rollback();
      return next(
        new ErrorHandler("Both country code and phone number are required", 400)
      );
    }

    if (!campaignId) {
      await transaction.rollback();
      return next(new ErrorHandler("missing campaignId", 400));
    }

    // Get SMS configuration for this campaign
    const SMS_CONFIG = await getSmsConfigForCampaign(campaignId, transaction);

    // Phone validation
    const phoneValidationResult = phoneValidation.validatePhone(
      countryCode,
      phone
    );

    if (!phoneValidationResult.isValid) {
      await transaction.rollback();
      return next(new ErrorHandler(phoneValidationResult.message, 400));
    }

    const cleanedPhone = phoneValidationResult.cleanedPhone;
    const cleanedCountryCode = phoneValidationResult.cleanedCode;

    // Find user
    const user = await Enduser.findOne({
      where: { countryCode: cleanedCountryCode, phone: cleanedPhone },
      transaction,
    });

    if (!user) {
      await transaction.rollback();
      return next(new ErrorHandler("User not found", 404));
    }

    // Check OTP attempts
    if (user.otpAttempts >= 3) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "Too many failed attempts. Please request a new OTP",
          429
        )
      );
    }

    // Check if OTP exists
    if (!user.otp) {
      await transaction.rollback();
      return next(new ErrorHandler("Please request a new OTP", 400));
    }

    // Check if OTP has expired
    if (user.otpExpire < Date.now()) {
      await transaction.rollback();
      return next(new ErrorHandler("OTP has expired", 400));
    }

    try {
      // Validate OTP with SMS provider
      const response = await axios({
        method: "post",
        url: `${SMS_CONFIG.baseURL}/verify/validate`,
        headers: {
          "Content-Type": "application/json",
          "api-key": SMS_CONFIG.apiKey,
        },
        data: {
          verify_id: user.otp,
          otp: otp,
        },
      });

      // Get campaign and brand information
      const campaign = await db.campaigns.findOne({
        where: { campaignID: campaignId },
        transaction,
      });

      if (!campaign) {
        await transaction.rollback();
        return next(new ErrorHandler("Invalid campaign or brand", 400));
      }

      const brandId = campaign.createdBy; // Campaign creator's ID

      // Check if user is already verified for this brand
      let brandVerification = await db.EndUserBrandVerification.findOne({
        where: {
          enduserId: user.id,
          brandId: brandId,
        },
        transaction,
      });

      let isNewVerification = false;

      if (!brandVerification) {
        // First time verification for this brand
        isNewVerification = true;
        brandVerification = await db.EndUserBrandVerification.create(
          {
            enduserId: user.id,
            brandId: brandId,
            isVerified: true,
            verifiedAt: new Date(),
          },
          { transaction }
        );

        // Associate user with all campaigns of this brand
        const brandCampaigns = await db.campaigns.findAll({
          include: [
            {
              model: db.users,
              as: "users",
              where: { id: brandId },
              through: { attributes: [] },
            },
          ],
          transaction,
        });

        await Promise.all(
          brandCampaigns.map((campaign) =>
            user.addCampaign(campaign, { transaction })
          )
        );
      }

      // Update user's OTP status
      user.isPhoneVerified = true;
      user.otp = null;
      user.otpExpire = null;
      user.otpAttempts = 0;
      await user.save({ transaction });

      // Generate token
      const tokenPayload = {
        type: "ENDUSER",
        obj: {
          id: user.id,
          countryCode: user.countryCode,
          phone: user.phone,
          brandId: brandId, // Include brandId in token
        },
      };

      const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET);
      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: isNewVerification
          ? "Phone verified successfully"
          : "Login successful",
        data: {
          id: user.id,
          countryCode: user.countryCode,
          phone: user.phone,
          isNewVerification,
          brandId,
        },
        token: accessToken,
      });
    } catch (error) {
      // Increment attempts on failed verification
      user.otpAttempts += 1;
      await user.save({ transaction });
      await transaction.commit();

      // Handle SMS API errors
      if (error.response?.data?.error) {
        const smsError = error.response.data.error;
        return next(
          new ErrorHandler(smsError.message || "Invalid OTP", 400)
        );
      }
      throw error;
    }
  } catch (error) {
    await transaction.rollback();
    return next(
      new ErrorHandler(error.message || "Internal server error", 500)
    );
  }
});

// get user detail by token
const getUserByToken = asyncHandler(async (req, res, next) => {
  try {
    const id = req.user?.id;
    const user = await Enduser.findByPk(id, {
      attributes: { exclude: ["password", "otp", "otpExpire"] },
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

// ---------------apple signin---------------------------------
const appleLogin = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const authHeader = req.headers["authorization"];
    const idToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;
    // Extract and validate inputs
    const { email, name, appleUserId, campaignID } = req.body;

    // Validate input parameters
    if (!campaignID) {
      console.error("Validation error: Campaign ID is missing");
      return next(new ErrorHandler("Campaign ID is required", 400));
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
    // Verify campaign existence and get brand info
    const campaign = await Campaign.findOne({
      where: { campaignID },
      transaction,
    });

    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign not found", 404));
    }

    const brandId = campaign.createdBy;

    // Find existing user by Apple ID
    const existingUser = await Enduser.findOne({
      where: { appleUserId },
      transaction,
    });

    let user;
    let isNewVerification = false;

    if (!existingUser) {
      // Create new user
      user = await Enduser.create(
        {
          email: email?.toLowerCase(),
          name: name?.trim(),
          appleUserId: decodedToken.sub,
          // isEmailVerified: !!email,
          authProvider: "apple",
          IsActive: true,
        },
        { transaction }
      );

      isNewVerification = true;
    } else {
      // Update existing user if needed
      const updates = {};
      if (email && !existingUser.email) {
        updates.email = email.toLowerCase();
        // updates.isEmailVerified = true;
      }
      if (name && !existingUser.name) {
        updates.name = name.trim();
      }

      if (Object.keys(updates).length > 0) {
        await existingUser.update(updates, { transaction });
      }
      user = existingUser;
    }

    // Handle brand verification
    let brandVerification = await db.EndUserBrandVerification.findOne({
      where: {
        enduserId: user.id,
        brandId: brandId,
      },
      transaction,
    });

    if (!brandVerification) {
      // First time verification for this brand
      brandVerification = await db.EndUserBrandVerification.create(
        {
          enduserId: user.id,
          brandId: brandId,
          isVerified: true,
          verifiedAt: new Date(),
        },
        { transaction }
      );

      // Associate user with all campaigns of this brand
      const brandCampaigns = await db.campaigns.findAll({
        include: [
          {
            model: db.users,
            as: "users",
            where: { id: brandId },
            through: { attributes: [] },
          },
        ],
        transaction,
      });

      await Promise.all(
        brandCampaigns.map((campaign) =>
          user.addCampaign(campaign, { transaction })
        )
      );
    }
    // Generate token
    const tokenPayload = {
      type: "ENDUSER",
      obj: {
        id: user.id,
        email: user.email,
        appleUserId: user.appleUserId,
        brandId: brandId,
      },
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET);
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: isNewVerification ? "Signup successful" : "Login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          // isEmailVerified: user.isEmailVerified,
          isNewVerification,
          brandId,
        },
        token: accessToken,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Apple Login Error:", error);
    return next(new ErrorHandler("Authentication failed", 500));
  }
});

//-----------------google signin------------------
const googleLogin = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { campaignID } = req.body;
    const authHeader = req.headers["authorization"];
    const idToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;

    // Validate input parameters
    if (!campaignID) {
      console.error("Validation error: Campaign ID is missing");
      return next(new ErrorHandler("Campaign ID is required", 400));
    }
    if (!idToken || idToken === "null") {
      console.error("Validation error: Authorization token is missing");
      return next(new ErrorHandler("Authorization token is required", 401));
    }

    // Verify Google token
    let googlePayload = await verifyGoogleLogin(idToken);
    if (!googlePayload?.sub) {
      return next(new ErrorHandler("Invalid Google account information", 400));
    }

    // Verify campaign existence and get brand info
    const campaign = await Campaign.findOne({
      where: { campaignID },
      transaction,
    });

    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign not found", 404));
    }

    const brandId = campaign.createdBy;

    // Find existing user
    const existingUser = await Enduser.findOne({
      where: { googleUserId: googlePayload.sub },
      transaction,
    });

    let user;
    let isNewVerification = false;

    if (!existingUser) {
      // Validate email if present
      if (googlePayload.email && !isValidEmail(googlePayload.email)) {
        return next(
          new ErrorHandler("Invalid email format from Google account", 400)
        );
      }

      // Create new user
      user = await Enduser.create(
        {
          email: googlePayload.email,
          name: googlePayload.name,
          googleUserId: googlePayload.sub,
          // isEmailVerified: true,
          authProvider: "google",
          IsActive: true,
        },
        { transaction }
      );

      isNewVerification = true;
    } else {
      user = existingUser;
    }

    // Handle brand verification
    let brandVerification = await db.EndUserBrandVerification.findOne({
      where: {
        enduserId: user.id,
        brandId: brandId,
      },
      transaction,
    });

    if (!brandVerification) {
      // First time verification for this brand
      brandVerification = await db.EndUserBrandVerification.create(
        {
          enduserId: user.id,
          brandId: brandId,
          isVerified: true,
          verifiedAt: new Date(),
        },
        { transaction }
      );

      // Associate user with all campaigns of this brand
      const brandCampaigns = await db.campaigns.findAll({
        include: [
          {
            model: db.users,
            as: "users",
            where: { id: brandId },
            through: { attributes: [] },
          },
        ],
        transaction,
      });

      await Promise.all(
        brandCampaigns.map((campaign) =>
          user.addCampaign(campaign, { transaction })
        )
      );
    }
    // Generate token
    const tokenPayload = {
      type: "ENDUSER",
      obj: {
        id: user.id,
        email: user.email,
        googleUserId: user.googleUserId,
        brandId: brandId,
      },
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET);
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: isNewVerification ? "Signup successful" : "Login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          // isEmailVerified: user.isEmailVerified,
          isNewVerification,
          brandId,
        },
        token: accessToken,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Google login error:", error);
    return next(
      error instanceof ErrorHandler
        ? error
        : new ErrorHandler(
            error.message || "An error occurred during login",
            500
          )
    );
  }
});

// ---------------save visitor and campaign id--------------------------------
const saveVisitorAndCampaign = asyncHandler(async (req, res) => {
  const { visitorId, deviceId, campaignID } = req.body;
  console.log("line 1437", visitorId);

  // Validate required inputs
  if (!campaignID) {
    return res.status(400).json({
      success: false,
      error: "Campaign ID is required.",
    });
  }

  // Validate input identifiers
  if (!visitorId && !deviceId) {
    return res.status(400).json({
      success: false,
      error: "Either visitorId or deviceId must be provided.",
    });
  }
  const transaction = await sequelize.transaction();
  try {
    // Check if the campaign exists
    const campaign = await Campaign.findByPk(campaignID, { transaction });
    if (!campaign) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: "Campaign not found.",
      });
    }

    // Construct search conditions for finding existing user
    const findUserConditions = {
      where: {
        [Op.or]: [
          ...(deviceId ? [{ deviceId: { [Op.contains]: [deviceId] } }] : []),
          ...(visitorId
            ? [{ visitorIds: { [Op.contains]: [visitorId] } }]
            : []),
        ],
      },
      transaction,
    };

    // Look for existing users with either deviceId or visitorId
    let existingUser = await Enduser.findOne(findUserConditions);
    console.log("existingUser", existingUser);

    // If user exists
    if (existingUser) {
      // Check if user is already associated with the campaign
      const isCampaignAssociated =
        existingUser.campaigns && existingUser.campaigns.length > 0;

      if (isCampaignAssociated) {
        // User is already associated with the campaign
        return res.status(200).json({
          success: true,
          message: "User is already registered for this campaign.",
          user: {
            id: existingUser.id,
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
      } else {
        // Associate user with the new campaign
        await existingUser.addCampaign(campaign, { transaction });
        await transaction.commit();

        return res.status(200).json({
          success: true,
          message: "Existing user associated with campaign.",
          user: {
            id: existingUser.id,
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
    }

    const validDeviceId =
      deviceId && typeof deviceId === "string" ? [deviceId] : [];
    const validVisitorId =
      visitorId && typeof visitorId === "string" ? [visitorId] : [];

    const newUser = await Enduser.create(
      {
        deviceId: validDeviceId,
        visitorIds: validVisitorId,
      },
      { transaction }
    );

    // Associate new user with campaign
    await newUser.addCampaign(campaign, { transaction });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: "New user created and associated with campaign.",
      user: {
        id: newUser.id,
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
    console.error("Error in saveVisitorAndCampaign:", error);

    return res.status(500).json({
      success: false,
      error: "An error occurred while processing the request.",
    });
  }
});

module.exports = {
  sendPhoneOtp,
  phoneVerification,
  appleLogin,
  googleLogin,
  saveVisitorAndCampaign,
};
