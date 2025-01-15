const db = require("../dbConfig/dbConfig");
const User = db.users;
const DeletionRequest = db.deletionRequest;
const {
  generateToken,
  generateOtp
} = require("../validators/userValidation.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");
const crypto = require('crypto');
const { sendWhatsAppLink, getLinkMessageInput, generateAuthLink } = require('../utils/whatsappHandler');
const { v4: UUIDV4 } = require("uuid");
const { phoneValidation } = require("../utils/phoneValidation.js");



// Enhanced Facebook signed request parsing with security checks
function parseSignedRequest(signedRequest) {
  try {
    if (!signedRequest || typeof signedRequest !== 'string') {
      throw new Error('Invalid signed request format');
    }

    const parts = signedRequest.split('.');
    if (parts.length !== 2) {
      throw new Error('Invalid signed request structure');
    }

    const [encodedSig, payload] = parts;
    
    // Verify signature (add your app secret here)
    const sig = base64UrlDecode(encodedSig);
    const expectedSig = crypto
      .createHmac('sha256', process.env.FACEBOOK_APP_SECRET)
      .update(payload)
      .digest('base64');
    
    if (sig !== expectedSig) {
      throw new Error('Invalid signature');
    }

    const data = JSON.parse(base64UrlDecode(payload));
    
    // Validate required fields
    if (!data.user_id || !data.algorithm || data.algorithm !== 'HMAC-SHA256') {
      throw new Error('Missing or invalid required fields');
    }

    return data;
  } catch (error) {
    console.error('Error parsing signed request:', error);
    return null;
  }
}

function base64UrlDecode(input) {
  try {
    input = input.replace(/-/g, '+').replace(/_/g, '/');
    const padding = 4 - (input.length % 4);
    if (padding !== 4) {
      input += '='.repeat(padding);
    }
    return Buffer.from(input, 'base64').toString('utf-8');
  } catch (error) {
    console.error('Error decoding base64:', error);
    return null;
  }
}


// Controller function to send OTP via WhatsApp
const sendWhatsAppOTP = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { countryCode, phone } = req.body;

    if (!phone || !countryCode) {
      return next(new ErrorHandler("Both country code and phone number are required", 400));
    }

    const phoneValidationResult = phoneValidation.validatePhone(countryCode, phone);
    if (!phoneValidationResult.isValid) {
      return next(new ErrorHandler(phoneValidationResult.message, 400));
    }

    const cleanedPhone = phoneValidationResult.cleanedPhone;
    const cleanedCountryCode = phoneValidationResult.cleanedCode;

    // Rate limiting check (add to user model)
    const user = await User.findOne({
      where: { countryCode: cleanedCountryCode, phone: cleanedPhone },
      transaction
    });

    if (user && user.lastOtpSentAt) {
      const timeDiff = Date.now() - user.lastOtpSentAt;
      if (timeDiff < 60000) { // 1 minute cooldown
        await transaction.rollback();
        return next(new ErrorHandler("Please wait before requesting another OTP", 429));
      }
    }

    const otp = generateOtp();
    const expireTime = Date.now() + 5 * 60 * 1000; // 5 minutes

    const message = `Your verification code is: ${otp}. This code will expire in 5 minutes. Please do not share this code with anyone.`;
    const validPhone = cleanedCountryCode + cleanedPhone;
    const messageInput = getTextMessageInput(validPhone, message);

    const response = await sendMessage(JSON.parse(messageInput));

    if (!user) {
      await User.create({
        countryCode: cleanedCountryCode,
        phone: cleanedPhone,
        metaOtp: otp,
        metaOtpExpire: expireTime,
        lastOtpSentAt: Date.now(),
        otpAttempts: 0
      }, { transaction });
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
        ...(process.env.NODE_ENV === 'development' && { otp })
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error sending OTP:", error);
    return next(new ErrorHandler(error.response?.data?.message || "Failed to send OTP", error.response?.status || 500));
  }
});

const otpVerification = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { countryCode, phone, otp } = req.body;

    if (!otp?.trim()) {
      return next(new ErrorHandler("OTP is required", 400));
    }

    if (!phone || !countryCode) {
      return next(new ErrorHandler("Both country code and phone number are required", 400));
    }

    const phoneValidationResult = phoneValidation.validatePhone(countryCode, phone);
    if (!phoneValidationResult.isValid) {
      return next(new ErrorHandler(phoneValidationResult.message, 400));
    }

    const cleanedPhone = phoneValidationResult.cleanedPhone;
    const cleanedCountryCode = phoneValidationResult.cleanedCode;

    const user = await User.findOne({
      where: { countryCode: cleanedCountryCode, phone: cleanedPhone },
      transaction
    });

    if (!user) {
      await transaction.rollback();
      return next(new ErrorHandler("User not found", 404));
    }

    // Check OTP attempts
    if (user.otpAttempts >= 3) {
      await transaction.rollback();
      return next(new ErrorHandler("Too many failed attempts. Please request a new OTP", 429));
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

    // Update user
    user.isPhoneVerified = true;
    user.metaOtp = null;
    user.metaOtpExpire = null;
    user.otpAttempts = 0;
    await user.save({ transaction });

    const tokenPayload = {
      type: "USER",
      obj: {
        id: user.id,
        countryCode: user.countryCode,
        phone: user.phone
      }
    };

    const accessToken = generateToken(tokenPayload);
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Phone verified successfully",
      data: {
        id: user.id,
        countryCode: user.countryCode,
        phone: user.phone
      },
      token: accessToken
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message || "Internal server error", 500));
  }
});
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

const initiateWhatsAppLogin = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { countryCode, phone } = req.body;

    if (!phone || !countryCode) {
      return next(new ErrorHandler("Both country code and phone number are required", 400));
    }

    const phoneValidationResult = phoneValidation.validatePhone(countryCode, phone);
    if (!phoneValidationResult.isValid) {
      return next(new ErrorHandler(phoneValidationResult.message, 400));
    }

    const cleanedPhone = phoneValidationResult.cleanedPhone;
    const cleanedCountryCode = phoneValidationResult.cleanedCode;
    const validPhone = cleanedCountryCode + cleanedPhone;

    // Generate state for security
    const state = UUIDV4();
    const authLink = generateAuthLink(validPhone, state);
    
    const message = "Click the link below to login to your account:";
    const messageInput = getLinkMessageInput(validPhone, authLink, message);

    const response = await sendWhatsAppLink(JSON.parse(messageInput));

    // Store state in user record or separate table
    let user = await User.findOne({
      where: { countryCode: cleanedCountryCode, phone: cleanedPhone },
      transaction
    });

    if (!user) {
      user = await User.create({
        countryCode: cleanedCountryCode,
        phone: cleanedPhone,
        authState: state,
        stateExpiry: Date.now() + 5 * 60 * 1000, // 5 minutes validity
      }, { transaction });
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
        state
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error initiating WhatsApp login:", error);
    return next(new ErrorHandler(error.response?.data?.message || "Failed to initiate login", error.response?.status || 500));
  }
});

const handleWhatsAppCallback = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { state, phone } = req.query;

    if (!state || !phone) {
      return next(new ErrorHandler("Invalid authentication callback", 400));
    }

    const user = await User.findOne({
      where: { 
        phone: phone.slice(-10),
        authState: state,
        stateExpiry: { [db.Sequelize.Op.gt]: Date.now() }
      },
      transaction
    });

    if (!user) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid or expired authentication request", 401));
    }

    // Clear auth state
    user.authState = null;
    user.stateExpiry = null;
    user.isPhoneVerified = true;
    await user.save({ transaction });

    const tokenPayload = {
      type: "USER",
      obj: {
        id: user.id,
        countryCode: user.countryCode,
        phone: user.phone
      }
    };

    const accessToken = generateToken(tokenPayload);
    await transaction.commit();

    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL}/auth/success?token=${accessToken}`);
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
  handleWhatsAppCallback
};
