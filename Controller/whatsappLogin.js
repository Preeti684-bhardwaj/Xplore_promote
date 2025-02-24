const db = require("../dbConfig/dbConfig");
const Enduser = db.endusers;
const Campaign = db.campaigns;
const DeletionRequest = db.deletionRequest;
const sequelize = db.sequelize;
const {
  generateToken,
  generateOtp,
} = require("../validators/userValidation.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

const {
  sendWhatsAppMessage,
  getLinkMessageInput,
  generateAuthLink,
  getOtpMessage,
  parseSignedRequest,
} = require("../utils/whatsappHandler");
const { v4: UUIDV4 } = require("uuid");
const { phoneValidation } = require("../utils/phoneValidation.js");

//----------------send OTP via WhatsApp----------------------------------
const sendWhatsAppOTP = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { countryCode, phone, campaignId } = req.body;

    if (!phone || !countryCode) {
      return next(
        new ErrorHandler("Both country code and phone number are required", 400)
      );
    }
    if (!campaignId) {
      return next(new ErrorHandler("missing campaignId", 400));
    }
    // Find the campaign by shortCode
    const campaign = await db.campaigns.findOne({
      where: { campaignID: campaignId },
      transaction,
    });

    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid campaign id", 400));
    }

    const phoneValidationResult = phoneValidation.validatePhone(
      countryCode,
      phone
    );
    if (!phoneValidationResult.isValid) {
      return next(new ErrorHandler(phoneValidationResult.message, 400));
    }

    const cleanedPhone = phoneValidationResult.cleanedPhone;
    const cleanedCountryCode = phoneValidationResult.cleanedCode;

    // Rate limiting check (add to user model)
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

    const otp = generateOtp();
    const expireTime = Date.now() + 5 * 60 * 1000; // 5 minutes

    const message = otp;
    const validPhone = cleanedCountryCode + cleanedPhone; //`+${cleanedCountryCode}${cleanedPhone}`
    const messageInput = getOtpMessage(validPhone, message);
    console.log(messageInput);
    const response = await sendWhatsAppMessage(messageInput);

    if (!user) {
      await Enduser.create(
        {
          countryCode: cleanedCountryCode,
          phone: cleanedPhone,
          metaOtp: otp,
          metaOtpExpire: expireTime,
          lastOtpSentAt: Date.now(),
          otpAttempts: 0,
        },
        { transaction }
      );
    } else {
      user.metaOtp = otp;
      user.metaOtpExpire = expireTime;
      user.lastOtpSentAt = Date.now();
      user.otpAttempts = 0;
      await user.save({ transaction });
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      data: {
        messageId: response.data.messages[0].id,
        otp,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error sending OTP:", error);
    return next(
      new ErrorHandler(
        error.response?.data?.message || "Failed to send OTP",
        error.response?.status || 500
      )
    );
  }
});

//---------------whatsapp otp verification-----------------------------------
const otpVerification = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { countryCode, phone, otp, campaignId } = req.body;

    if (!otp?.trim()) {
      return next(new ErrorHandler("OTP is required", 400));
    }

    if (!phone || !countryCode) {
      return next(
        new ErrorHandler("Both country code and phone number are required", 400)
      );
    }
    if (!campaignId) {
      return next(new ErrorHandler("missing campaignId", 400));
    }

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

    // Validate OTP
    if (user.metaOtp !== otp) {
      user.otpAttempts += 1;
      await user.save({ transaction });
      await transaction.commit();
      return next(new ErrorHandler("Invalid OTP", 400));
    }

    if (user.metaOtpExpire < Date.now()) {
      await transaction.rollback();
      return next(new ErrorHandler("OTP has expired", 400));
    }

    // Get campaign and brand (campaign creator) information
    const campaign = await db.campaigns.findOne({
      where: { campaignID: campaignId},
     
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
    user.metaOtp = null;
    user.metaOtpExpire = null;
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

    const accessToken = generateToken(tokenPayload);
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
    await transaction.rollback();
    return next(
      new ErrorHandler(error.message || "Internal server error", 500)
    );
  }
});

//--------------- facebook user data deletion-------------------------------------
const facebookDataDeletion = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const signedRequest = req.body.signed_request;
    const data = parseSignedRequest(signedRequest);

    if (!data) {
      return next(new ErrorHandler("Invalid signed request", 400));
    }

    const userId = data?.user_id;

    // Check if there is an existing deletion request for the user
    const existingDeletionRequest = await DeletionRequest.findOne({
      where: { userId },
      order: [["createdAt", "DESC"]],
      transaction,
    });

    let BASE_URL =
      process.env.PRODUCTION_BASE_URL || process.env.DEVELOPEMENT_BASE_URL;

    if (existingDeletionRequest) {
      if (existingDeletionRequest.status === "pending") {
        // Return the URL and confirmation code of the existing request if pending
        const statusUrl = `${BASE_URL}/deletion?id=${existingDeletionRequest.id}`;
        const responseData = {
          url: statusUrl,
          confirmation_code: existingDeletionRequest.confirmationCode,
        };

        await transaction.commit();
        return res.json(responseData);
      } else if (existingDeletionRequest.status === "completed") {
        // Delete the user's data again if a completed deletion request exists
        const user = await User.findOne({ where: { id: userId }, transaction });
        console.log(user);
        if (user) {
          await User.destroy({ where: { id: userId }, transaction });

          const statusUrl = `${BASE_URL}/deletion?id=${existingDeletionRequest.id}`;
          const responseData = {
            url: statusUrl,
            confirmation_code: existingDeletionRequest.confirmationCode,
          };
          await transaction.commit();
          return res.json(responseData);
        }
      } else if (existingDeletionRequest.status === "user_not_found") {
        // Retry the deletion process for the user if user_not_found status
        await DeletionRequest.destroy({ where: { userId }, transaction });
        // continue with the deletion process
      }
    }

    // Start data deletion for the user
    const user = await User.findOne({ where: { userId }, transaction });
    let status;
    if (user) {
      await User.destroy({ where: { userId }, transaction });
      status = "completed";
    } else {
      status = "user_not_found";
    }

    const confirmationCode = UUIDV4(); // Generate a unique code for the deletion request
    const deleteDataCreation = await DeletionRequest.create(
      {
        userId,
        confirmationCode,
        status,
      },
      { transaction }
    );

    await transaction.commit();

    const statusUrl = `${BASE_URL}/deletion?id=${deleteDataCreation.id}`; // URL to track the deletion
    const responseData = {
      url: statusUrl,
      confirmation_code: confirmationCode,
    };
    res.json(responseData);
  } catch (error) {
    await transaction.rollback();
    console.error("Error processing deletion request:", error);
    return next(
      new ErrorHandler(error.message || "Internal server error", 500)
    );
  }
});

//------------------deletion of data-------------------------------------------------
const deletionData = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.query;

    // Check if the deletion request ID is provided
    if (!id) {
      return next(new ErrorHandler("Deletion request ID is required", 400));
    }

    const deletionRequest = await DeletionRequest.findOne({ where: { id } });

    // Check if the deletion request exists
    if (!deletionRequest) {
      return next(new ErrorHandler("Deletion request not found", 404));
    }

    // Return the status of the deletion request
    res.status(200).json({
      status: deletionRequest.status, // 'pending', 'completed', 'user_not_found', etc.
      confirmation_code: deletionRequest.confirmationCode,
    });
  } catch (error) {
    // Handle any other errors
    console.error("Error retrieving deletion data:", error);
    return next(
      new ErrorHandler(error.message || "Internal server error", 500)
    );
  }
});

//----------------whatsapp link initiated----------------------------------------
const initiateWhatsAppLogin = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { countryCode, phone, shortCode, layoutId } = req.body;

    if (!phone || !countryCode) {
      return next(
        new ErrorHandler("Both country code and phone number are required", 400)
      );
    }
    if (!shortCode || !layoutId) {
      return next(
        new ErrorHandler("Both shortcode and layoutId are required", 400)
      );
    }
    // Find campaign with its associated layouts
    const campaign = await Campaign.findOne({
      where: {
        shortCode: shortCode,
      },
      include: [
        {
          model: db.layouts,
          as: "layouts",
          where: {
            layoutID: layoutId,
          },
          required: false,
        },
      ],
      transaction,
    });

    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign not found", 404));
    }

    // Check if the layout exists and belongs to the campaign
    if (!campaign.layouts || campaign.layouts.length === 0) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "Layout not found or does not belong to this campaign",
          404
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

    const cleanedPhone = phoneValidationResult.cleanedPhone;
    const cleanedCountryCode = phoneValidationResult.cleanedCode;
    const validPhone = cleanedCountryCode + cleanedPhone;
    let user = await Enduser.findOne({
      where: { countryCode: cleanedCountryCode, phone: cleanedPhone },
      transaction,
    });

    // Generate state for security
    const state = UUIDV4();
    const authLink = generateAuthLink(
      countryCode,
      phone,
      state,
      shortCode,
      layoutId
    );
    const messageInput = getLinkMessageInput(validPhone, authLink);

    // Log the exact payload being sent
    console.log(
      "WhatsApp API Request Payload:",
      JSON.stringify(messageInput, null, 2)
    );

    const response = await sendWhatsAppMessage(messageInput);

    if (!user) {
      user = await Enduser.create(
        {
          countryCode: cleanedCountryCode,
          phone: cleanedPhone,
          authState: state,
          stateExpiry: Date.now() + 5 * 60 * 1000,
        },
        { transaction }
      );
    } else {
      user.authState = state;
      user.stateExpiry = Date.now() + 5 * 60 * 1000;
      await user.save({ transaction });
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Authentication link sent successfully",
      data: {
        messageId: response.data.messages[0].id,
        state,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error initiating WhatsApp login:", error);
    return next(
      new ErrorHandler(
        error.response?.data?.error?.message || "Failed to initiate login",
        error.response?.status || 500
      )
    );
  }
});

//------------------handle whtsapp callback----------------------------------------
const handleWhatsAppCallback = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { state, countryCode, phone, shortCode, layoutId } = req.query;

    if (!state || !countryCode || !phone || !shortCode || !layoutId) {
      return next(new ErrorHandler("Invalid authentication callback", 400));
    }

    // Find the user
    const user = await Enduser.findOne({
      where: {
        countryCode: countryCode,
        phone: phone,
        authState: state,
        stateExpiry: { [db.Sequelize.Op.gt]: Date.now() },
      },
      transaction,
    });

    if (!user) {
      await transaction.rollback();
      return next(
        new ErrorHandler("Invalid or expired authentication request", 401)
      );
    }

       // Get campaign and brand information
       const campaign = await db.campaigns.findOne({
        where: { shortCode },
        transaction,
      });
  
      if (!campaign) {
        await transaction.rollback();
        return next(new ErrorHandler("Invalid campaign or brand", 400));
      }
  
      const brandId = campaign.createdBy;
  
      // Check brand verification status
      let brandVerification = await db.EndUserBrandVerification.findOne({
        where: {
          enduserId: user.id,
          brandId: brandId
        },
        transaction,
      });
  
      let isNewVerification = false;
  
      if (!brandVerification) {
        // First time verification for this brand
        isNewVerification = true;
        brandVerification = await db.EndUserBrandVerification.create({
          enduserId: user.id,
          brandId: brandId,
          isVerified: true,
          verifiedAt: new Date()
        }, { transaction });
  
        // Associate with all brand campaigns
        const brandCampaigns = await db.campaigns.findAll({
          include: [{
            model: db.users,
            as: 'users',
            where: { id: brandId },
            through: { attributes: [] }
          }],
          transaction,
        });
  
        await Promise.all(
          brandCampaigns.map(campaign => 
            user.addCampaign(campaign, { transaction })
          )
        );
      }
  
      // Clear auth state
      user.authState = null;
      user.stateExpiry = null;
      await user.save({ transaction });
  
      // Generate token
      const tokenPayload = {
        type: "ENDUSER",
        obj: {
          id: user.id,
          countryCode: user.countryCode,
          phone: user.phone,
          brandId: brandId
        },
      };
  
      const accessToken = generateToken(tokenPayload);
      await transaction.commit();
  
      // Redirect with appropriate parameters
      res.redirect(
        `${process.env.DEVELOPEMENT_BASE_URL}/${shortCode}/${layoutId}?token=${accessToken}`
      );
    } catch (error) {
      await transaction.rollback();
      console.error("Error handling WhatsApp callback:", error);
      res.redirect(`${process.env.FRONTEND_URL}/auth/error`);
    }
  });

module.exports = {
  sendWhatsAppOTP,
  otpVerification,
  facebookDataDeletion,
  deletionData,
  initiateWhatsAppLogin,
  handleWhatsAppCallback,
};
