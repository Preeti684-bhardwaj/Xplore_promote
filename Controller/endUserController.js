const db = require("../dbConfig/dbConfig.js");
const sequelize = db.sequelize;
const Enduser = db.endUsers;
const Campaign = db.campaigns;
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { isValidEmail } = require("../validators/validation.js");
const {
  generateToken,
} = require("../validators/userValidation.js");
const { CLIENT_ID, ANDROID_ENDUSER_CLIENT_ID, WEB_ENDUSER_CLIENT_ID } =
  process.env;
const { OAuth2Client } = require("google-auth-library");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

const googleClient = new OAuth2Client({
  clientId: CLIENT_ID || ANDROID_ENDUSER_CLIENT_ID || WEB_ENDUSER_CLIENT_ID,
});

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
        where: { createdBy: brandId },
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

    const accessToken = generateToken(tokenPayload);
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
        where: { createdBy: brandId },
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

    const accessToken = generateToken(tokenPayload);
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
  appleLogin,
  googleLogin,
  saveVisitorAndCampaign,
};
