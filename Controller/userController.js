const db = require("../dbConfig/dbConfig.js");
const User = db.users;
const QRSession = db.qrSessions;
const Campaign = db.campaigns;
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const sequelize = db.sequelize;
const sendEmail = require("../utils/sendEmail.js");
const { phoneValidation } = require("../utils/phoneValidation.js");
const { validateFiles } = require("../validators/campaignValidations.js");
const { deleteQRSession } = require("../utils/qrService.js");
const shortId = require("shortid");
const {
  isValidEmail,
  isPhoneValid,
  isValidPassword,
  isValidLength,
} = require("../validators/validation.js");
const {
  generateToken,
  generateOtp,
  hashPassword,
} = require("../validators/userValidation.js");
const { uploadFile } = require("../utils/cdnImplementation.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");
const axios = require("axios");
// const {
//   RequestError,
//   FingerprintJsServerApiClient,
//   TooManyRequestsError,
//   Region
// }  =require('@fingerprintjs/fingerprintjs-pro-server-api')
// const {FINGERPRINT_SECRETKEY} = process.env
require("dotenv").config();
const {
  KALEYRA_BASE_URL,
  KALEYRA_API_KEY,
  KALEYRA_FLOW_ID,
  KALEYRA_PHONE_FLOW_ID,
} = process.env;

// Kaleyra API configuration
const KALEYRA_CONFIG = {
  baseURL: KALEYRA_BASE_URL,
  apiKey: KALEYRA_API_KEY,
  flowId: KALEYRA_FLOW_ID,
  phoneFlowId: KALEYRA_PHONE_FLOW_ID,
};

// const client = new FingerprintJsServerApiClient({
//   apiKey:FINGERPRINT_SECRETKEY,
//   region: Region.AP,
// })

// // // Get visit history of a specific visitor
// client.getVisits('<visitorId>').then((visitorHistory) => {
//   console.log(visitorHistory)
// })
// // Get a specific identification event
// client.getEvent('<requestId>').then((event) => {
//   console.log(event)
// })

const registerUser = asyncHandler(async (req, res, next) => {
  try {
    const { name, countryCode, phone, email, password } = req.body;
    // Validate required fields (phone excluded as it's optional)
    if ([name, email, password].some((field) => field?.trim() === "")) {
      return next(new ErrorHandler("All required fields must be filled", 400));
    }

    // Validate input fields
    if (!name) {
      return next(new ErrorHandler("Name is missing", 400));
    }

    // if (!phone) {
    // return next(new ErrorHandler("Phone is missing", 400));
    //}
    if (!email) {
      return next(new ErrorHandler("Email is missing", 400));
    }
    if (!password) {
      return next(new ErrorHandler("Password is missing", 400));
    }

    // Sanitize name: trim and reduce multiple spaces to a single space
    name.trim().replace(/\s+/g, " ");
    // Convert the email to lowercase for case-insensitive comparison
    const lowercaseEmail = email.toLowerCase();

    // Validate name
    const nameError = isValidLength(name);
    if (nameError) {
      return next(new ErrorHandler(nameError, 400));
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

    // Validate email format
    if (!isValidEmail(email)) {
      return next(new ErrorHandler("Invalid email", 400));
    }

    // Modify the query to handle optional phone
    let whereClause = {
      [Op.or]: [{ email: lowercaseEmail }],
    };

    // Only add phone to the query if it's provided
    if (cleanedPhone) {
      whereClause[Op.or].push({ phone: cleanedPhone });
    }

    // Check for existing user with the provided email or phone
    const existingUser = await User.findOne({
      where: whereClause,
    });

    if (existingUser) {
      if (existingUser.isEmailVerified) {
        // If the user is already verified, block the attempt to create a new account
        if (cleanedPhone && existingUser.phone === cleanedPhone) {
          return next(new ErrorHandler("Phone number already in use", 409));
        } else if (existingUser.email.toLowerCase() === lowercaseEmail) {
          return next(new ErrorHandler("Email already in use", 409));
        }
      } else {
        // For unverified users
        if (cleanedPhone && existingUser.phone === cleanedPhone) {
          return next(new ErrorHandler("Phone number already in use", 409));
        } else if (existingUser.email.toLowerCase() === lowercaseEmail) {
          return next(new ErrorHandler("Email already in use", 409));
        }
      }
    }

    // Validate the password and create a new user
    const passwordValidationResult = isValidPassword(password);
    if (passwordValidationResult) {
      return next(new ErrorHandler(passwordValidationResult, 400));
    }

    const hashedPassword = await hashPassword(password);

    // Create a new user if no existing user is found
    const user = await User.create({
      name,
      ...(cleanedPhone && {
        phone: cleanedPhone,
        countryCode: cleanedCountryCode,
      }), // Only include phone if it's provided
      email,
      password: hashedPassword,
      authProvider: "local",
    });

    const userData = await User.findByPk(user.id, {
      attributes: ["id", "name", "email", "isEmailVerified"],
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: userData,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//----------send phone otp----------------------------
const sendPhoneOtp = asyncHandler(async (req, res, next) => {
  try {
    const { countryCode, phone } = req.body;
    // Phone Validation
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

    // Find user
    const user = await User.findOne({
      where: { countryCode: cleanedCountryCode, phone: cleanedPhone },
    });

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    if (user.isPhoneVerified) {
      return next(new ErrorHandler("Phone already verified", 409));
    }
    // Construct full phone number
    const fullPhoneNumber = `+${user.countryCode}${user.phone}`;

    try {
      // Call Kaleyra API to send OTP
      const response = await axios({
        method: "post",
        url: `${KALEYRA_CONFIG.baseURL}/verify`,
        headers: {
          "Content-Type": "application/json",
          "api-key": KALEYRA_CONFIG.apiKey,
        },
        data: {
          flow_id: KALEYRA_CONFIG.phoneFlowId,
          to: {
            mobile: fullPhoneNumber,
          },
        },
      });

      // Store verify_id in user record
      user.otp = response.data.data.verify_id;
      user.otpExpire = Date.now() + 10 * 60 * 1000; // 5 minutes
      await user.save({ validate: false });

      return res.status(200).json({
        success: true,
        message: `OTP sent successfully`,
        phone: fullPhoneNumber,
      });
    } catch (error) {
      // Handle Kaleyra API errors
      if (error.response?.data?.error) {
        const kaleyraError = error.response.data.error;
        return next(new ErrorHandler(kaleyraError.message, 400));
      }
      throw error;
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});
//----------phone verification----------------------------
const phoneVerification = asyncHandler(async (req, res, next) => {
  try {
    const { countryCode, phone, otp } = req.body;

    // Validate input
    if (!otp || otp.trim() === "") {
      return next(new ErrorHandler("OTP is required", 400));
    }
    // Phone Validation
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

    // Find user
    const user = await User.findOne({
      where: { countryCode: cleanedCountryCode, phone: cleanedPhone },
    });

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Check if verify_id exists and OTP hasn't expired
    if (!user.otp) {
      return next(new ErrorHandler("Please request a new OTP", 400));
    }
    if (user.otpExpire < Date.now()) {
      return next(new ErrorHandler("OTP has expired", 400));
    }

    try {
      // Validate OTP with Kaleyra
      const response = await axios({
        method: "post",
        url: `${KALEYRA_CONFIG.baseURL}/verify/validate`,
        headers: {
          "Content-Type": "application/json",
          "api-key": KALEYRA_CONFIG.apiKey,
        },
        data: {
          verify_id: user.otp,
          otp: otp,
        },
      });

      // Update user details
      user.isPhoneVerified = true;
      user.otp = null;
      user.otpExpire = null;
      await user.save();

      // const obj = {
      //   type: "USER",
      //   obj: user,
      // };
      // const accessToken = generateToken(obj);

      return res.status(200).json({
        success: true,
        message: "Phone verification successful",
        data: {
          id: user.id,
          name: user.name,
          phone: user.phone,
        },
      });
    } catch (error) {
      // Handle Kaleyra API errors
      if (error.response?.data?.error) {
        const kaleyraError = error.response.data.error;
        return next(
          new ErrorHandler(kaleyraError.message || "Invalid OTP", 400)
        );
      }
      throw error;
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});
//-----------send OTP-------------------------------
const sendOtp = asyncHandler(async (req, res, next) => {
  try {
    const { email } = req.body;

    // Check if the email field is provided and not empty after trimming
    if (!email || email.trim() === "") {
      return next(new ErrorHandler("Please provide email", 400));
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return next(new ErrorHandler("Invalid email", 400));
    }

    // Convert the email to lowercase for case-insensitive comparison
    const lowercaseEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      where: { email: lowercaseEmail },
    });

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    const otp = generateOtp();

    /*
    Hi
    To complete your verification, please use the One-Time Password (OTP) provided below.
    This OTP is for single use and will expire after 15 minutes for security reasons.
    Your verification code for Xplore Promote is: {OTP}
    Please do not share this OTP with anyone. If you did not request this, please reach out to our support team immediately.
    Best regards,
    Xplore Promote Team
    */

    // Create HTML content for the email
    const htmlContent = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2>One-Time Password (OTP) Verification</h2>
    <p>Dear ${user.name},</p>
    <p>Your verification code for Xplore Promote is:</p>
    <h1 style="font-size: 32px; background-color: #f0f0f0; padding: 10px; display: inline-block;">${otp}</h1>
    <p>This code is valid for 15 minutes.</p>
    <p>If you didn't request this code, please ignore this email.</p>
    <p>Best regards,<br>Xplore Promote Team</p>
  </div>
`;
    try {
      await sendEmail({
        email: user.email,
        subject: `Xplore Promote: Your Verification Code`,
        html: htmlContent,
      });

      user.otp = otp;
      user.otpExpire = Date.now() + 5 * 60 * 1000; // 5 minutes
      await user.save({ validate: false });

      return res.status(200).json({
        success: true,
        message: `OTP sent to ${user.email} successfully`,
        email: user.email,
      });
    } catch (emailError) {
      user.otp = null;
      user.otpExpire = null;
      await user.save({ validate: false });

      console.error("Failed to send OTP email:", emailError);
      return next(new ErrorHandler(error.message, 500));
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});
// const sendOtp = asyncHandler(async (req, res, next) => {
//   try {
//     const { email } = req.body;

//     // Validate input
//     if (!email || email.trim() === "") {
//       return next(new ErrorHandler("Please provide email", 400));
//     }
//     // if (!phone || phone.trim() === "") {
//     //   return next(new ErrorHandler("Please provide phone number", 400));
//     // }

//     // Validate email format
//     if (!isValidEmail(email)) {
//       return next(new ErrorHandler("Invalid email", 400));
//     }

//     const lowercaseEmail = email.toLowerCase().trim();

//     // Find user
//     const user = await User.findOne({
//       where: { email: lowercaseEmail },
//     });

//     if (!user) {
//       return next(new ErrorHandler("User not found", 404));
//     }
//     if (user.isEmailVerified) {
//       return next(new ErrorHandler("Verified User", 409));
//     }
//     const phone = user.phone;
//     // // Format phone number to include country code if not present
//     // const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;

//     try {
//       // Call Kaleyra API to send OTP
//       const response = await axios({
//         method: "post",
//         url: `${KALEYRA_CONFIG.baseURL}/verify`,
//         headers: {
//           "Content-Type": "application/json",
//           "api-key": KALEYRA_CONFIG.apiKey,
//         },
//         data: {
//           flow_id: KALEYRA_CONFIG.flowId,
//           to: {
//             mobile: phone,
//             email: lowercaseEmail,
//           },
//         },
//       });

//       // Store verify_id in user record
//       user.otp = response.data.data.verify_id;
//       user.otpExpire = Date.now() + 5 * 60 * 1000; // 15 minutes
//       await user.save({ validate: false });

//       return res.status(200).json({
//         success: true,
//         message: `OTP sent successfully`,
//         email: user.email,
//       });
//     } catch (error) {
//       // Handle Kaleyra API errors
//       if (error.response?.data?.error) {
//         const kaleyraError = error.response.data.error;
//         return next(new ErrorHandler(kaleyraError.message, 400));
//       }
//       throw error;
//     }
//   } catch (error) {
//     return next(new ErrorHandler(error.message, 500));
//   }
// });

//---------User emailVerification------------------------------
const emailVerification = asyncHandler(async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    // Validate the OTP
    if (!otp || otp.trim() === "") {
      return next(new ErrorHandler("OTP is required.", 400));
    }

    if (!email || email.trim() === "") {
      return next(new ErrorHandler("Please provide email", 400));
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return next(new ErrorHandler("Invalid email", 400));
    }

    // Convert the email to lowercase for case-insensitive comparison
    const lowercaseEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      where: { email: lowercaseEmail },
    });
    console.log(user);

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Check OTP validity
    if (user.otp !== otp) {
      return next(new ErrorHandler("Invalid OTP", 400));
    }
    if (user.otpExpire < Date.now()) {
      return next(new ErrorHandler("OTP has expired", 400));
    }

    // Update user details
    user.isEmailVerified = true;
    user.otp = null;
    user.otpExpire = null;
    await user.save();

    const obj = {
      type: "USER",
      obj: user,
    };
    const accessToken = generateToken(obj);

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
      token: accessToken,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// const emailVerification = asyncHandler(async (req, res, next) => {
//   try {
//     const { email, otp } = req.body;

//     // Validate input
//     if (!otp || otp.trim() === "") {
//       return next(new ErrorHandler("OTP is required.", 400));
//     }
//     if (!email || email.trim() === "") {
//       return next(new ErrorHandler("Please provide email", 400));
//     }
//     if (!isValidEmail(email)) {
//       return next(new ErrorHandler("Invalid email", 400));
//     }

//     const lowercaseEmail = email.toLowerCase().trim();

//     // Find user
//     const user = await User.findOne({
//       where: { email: lowercaseEmail },
//     });

//     if (!user) {
//       return next(new ErrorHandler("User not found", 404));
//     }

//     // Check if verify_id exists and OTP hasn't expired
//     if (!user.otp) {
//       return next(new ErrorHandler("Please request a new OTP", 400));
//     }
//     if (user.otpExpire < Date.now()) {
//       return next(new ErrorHandler("OTP has expired", 400));
//     }

//     try {
//       // Validate OTP with Kaleyra
//       const response = await axios({
//         method: "post",
//         url: `${KALEYRA_CONFIG.baseURL}/verify/validate`,
//         headers: {
//           "Content-Type": "application/json",
//           "api-key": KALEYRA_CONFIG.apiKey,
//         },
//         data: {
//           verify_id: user.otp,
//           otp: otp,
//         },
//       });

//       // Update user details
//       user.isEmailVerified = true;
//       user.otp = null;
//       user.otpExpire = null;
//       await user.save();

//       const obj = {
//         type: "USER",
//         obj: user,
//       };
//       const accessToken = generateToken(obj);

//       return res.status(200).json({
//         success: true,
//         message: "Verification successful",
//         data: {
//           id: user.id,
//           name: user.name,
//           email: user.email,
//           phone: user.phone,
//         },
//         token: accessToken,
//       });
//     } catch (error) {
//       // Handle Kaleyra API errors
//       if (error.response?.data?.error) {
//         const kaleyraError = error.response.data.error;
//         return next(
//           new ErrorHandler(kaleyraError.message || "Invalid OTP", 400)
//         );
//       }
//       throw error;
//     }
//   } catch (error) {
//     return next(new ErrorHandler(error.message, 500));
//   }
// });

//------------login user----------------------------------

const loginUser = asyncHandler(async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || email.trim() === "" || password.trim() === "") {
      return next(new ErrorHandler("Email and Password are required", 400));
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return next(new ErrorHandler("Invalid email", 400));
    }

    // Convert the email to lowercase for case-insensitive comparison
    const lowercaseEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      where: { email: lowercaseEmail },
    });

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }
    const isPasswordMatched = await bcrypt.compare(password, user.password);
    // console.log("Password match result:", isPasswordMatched);

    if (!isPasswordMatched) {
      return next(new ErrorHandler("Invalid password", 400));
    }
    if (user.role !== "CLIENT") {
      if (!user.isEmailVerified) {
        return next(
          new ErrorHandler("Please verify your OTP before logging in", 403)
        );
      }
    }
    console.log(user);
    let obj;
    if (user.role !== "CLIENT") {
      obj = {
        type: "USER",
        obj: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      };
    } else {
      obj = {
        type: "CLIENT",
        obj: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      };
    }
    const accessToken = generateToken(obj);

    // const loggedInUser = await User.findByPk(user.id, {
    //   attributes: {
    //     exclude: ["password", "otp", "otpExpire", "isEmailVerified"],
    //   },
    // });

    return res.status(200).json({
      success: true,
      message: "Login successfully",
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
      token: accessToken,
    });
  } catch (error) {
    return next(
      new ErrorHandler(
        error.message || "Some error occurred during signin.",
        500
      )
    );
  }
});

// ---------------FORGET PASSWORD-----------------------------------------------------
const forgotPassword = asyncHandler(async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || email.trim() === "") {
      return next(new ErrorHandler("Please provide Email", 400));
    }

    if (!isValidEmail(email)) {
      return next(new ErrorHandler("Invalid email", 400));
    }
    // Convert the email to lowercase for case-insensitive comparison
    const lowercaseEmail = email.toLowerCase().trim();
    let user;
    user = await User.findOne({
      where: {
        email: lowercaseEmail,
      },
    });

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }
    // if (!user.isEmailVerified) {
    //   return next(new ErrorHandler("User is not verified", 403));
    // }

    // Get ResetPassword Token
    const otp = generateOtp(); // Assuming you have a method to generate the OTP
    user.otp = otp;
    user.otpExpire = Date.now() + 15 * 60 * 1000; // Set OTP expiration time (e.g., 15 minutes)

    await user.save({ validate: false });

    // Create HTML content for the email
    // <img src="https://stream.xircular.io/AIengage.png" alt="AI Engage Logo" style="max-width: 200px; margin-bottom: 20px;">
    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Request</h2>
      <p>Hello ${user.name},</p>
      <p>You have requested a password reset for your Xplore Promote account.</p>
        <p>Your One Time Password (OTP) for Xplore Promote is:</p>
      <h1 style="font-size: 32px; background-color: #f0f0f0; padding: 10px; display: inline-block;">${otp}</h1>
      <p>This OTP is valid for 15 minutes.</p>
      <p>If you didn't request this password reset, please ignore this email.</p>
      <p>Best regards,<br>Xplore Promote Team</p>
    </div>
    `;
    try {
      await sendEmail({
        email: user.email,
        subject: `Xplore Promote: Password Reset Request`,
        html: htmlContent,
      });

      user.otp = otp;
      user.otpExpire = Date.now() + 15 * 60 * 1000; // 15 minutes

      await user.save({ validate: false });

      return res.status(200).json({
        success: true,
        message: `Password reset otp sent to ${user.email}`,
        userId: user.id,
      });
    } catch (emailError) {
      user.otp = null;
      user.otpExpire = null;
      await user.save({ validate: false });

      console.error("Failed to send OTP email:", emailError);
      return next(new ErrorHandler(emailError.message, 500));
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// ---------------RESET PASSWORD------------------------------------------------------------
const resetPassword = asyncHandler(async (req, res, next) => {
  try {
    const { password, otp } = req.body;
    const { userId } = req.params;

    // Validate input fields
    if (!password || password.trim() === "") {
      return next(new ErrorHandler("Missing Password", 400));
    }
    if (!otp || otp.trim() === "") {
      return next(new ErrorHandler("Missing OTP", 400));
    }
    if (!userId) {
      return next(new ErrorHandler("Missing userId", 400));
    }
    const passwordValidationResult = isValidPassword(password);
    if (passwordValidationResult) {
      return next(new ErrorHandler(passwordValidationResult, 400));
    }
    const hashedPassword = await hashPassword(password);

    // Find the user by ID
    const user = await User.findByPk(userId);

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Verify the OTP
    if (user.otp !== otp.trim()) {
      return next(new ErrorHandler("Invalid OTP", 400));
    }
    if (user.otpExpire < Date.now()) {
      return next(new ErrorHandler("Expired OTP", 400));
    }

    // Update the user's password and clear OTP fields
    user.password = hashedPassword;
    user.otp = null;
    user.otpExpire = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `Password reset successfully`,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});
// --------------getUserByquery----------------------------------
const getUserDetails = asyncHandler(async (req, res, next) => {
  try {
    const { type } = req.query;

    // Validate user authentication
    if (!userId) {
      return next(new ErrorHandler("Unauthorized access", 401));
    }

    // Validate query parameter
    if (!type) {
      return next(new ErrorHandler("Query parameter 'type' is required", 400));
    }

    // Validate type value
    if (!["personal", "professional"].includes(type.toLowerCase())) {
      return next(
        new ErrorHandler(
          "Type must be either 'personal' or 'professional'",
          400
        )
      );
    }

    // Fetch user from database
    const user = await User.findByPk(userId);

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    let responseData;

    // Prepare response based on type
    if (type.toLowerCase() === "personal") {
      responseData = {
        name: user.name,
        email: user.email,
        countryCode: user.countryCode || null,
        phone: user.phone,
        userImages: user.userImages || [],
        address: user.address || null,
        userWebsites: user.userWebsites || [],
        isEmailVerified: user.isEmailVerified,
        authProvider: user.authProvider,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } else {
      responseData = {
        name: user.name,
        email: user.professionalEmail,
        countryCode: user.countryCode || null,
        phone: user.phone,
        companyImages: user.companyImages || [],
        address: user.address || null,
        companyWebsite: user.companyWebsite || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    }

    // Return success response
    return res.status(200).json({
      success: true,
      message: `${type.toLowerCase()} details fetched successfully`,
      data: responseData,
    });
  } catch (error) {
    console.error("Get User Details Error:", error);
    return next(
      new ErrorHandler(error.message || "Error fetching user details", 500)
    );
  }
});
//----------------getById---------------------------------------
const getUserById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return next(new ErrorHandler("Missing User id", 400));
    }
    const item = await User.findByPk(id, {
      attributes: { exclude: ["password", "otp", "otpExpire"] },
    });
    if (!item) {
      return next(new ErrorHandler("User not found", 404));
    } else {
      return res.status(200).json({ success: true, data: item });
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//----------------get user by token-------------------------------------
const getUserByToken = asyncHandler(async (req, res, next) => {
  try {
    const id = req.user?.id;
    const user = await User.findByPk(id, {
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

//------------get insta verify-------------------------------------
const getInsta = asyncHandler(async (req, res, next) => {
  try {
    const userAgent = req.headers["user-agent"];
    console.log("User-Agent:", userAgent);

    if (userAgent && userAgent.includes("Instagram")) {
      console.log("Redirecting to Instagram link...");
      return res.redirect(302, "https://xplore-instant.vercel.app/");
    } else {
      console.log("Sending normal link...");
      return res
        .status(200)
        .send('<a href="https://xplore-instant.vercel.app/">Click Here</a>');
    }
  } catch (error) {
    console.error("Error occurred:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

//--------------------Update user-----------------------------
const updateUser = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user?.id || req.headers["userid"];
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
      return next(new ErrorHandler("Please pnew rovide a valid name", 400));
    }

    if (bodyData.address && typeof bodyData.address !== "object") {
      return next(new ErrorHandler("Address must be a valid object", 400));
    }

    if (bodyData.userWebsites) {
      if (!Array.isArray(bodyData.userWebsites)) {
        return next(new ErrorHandler("User websites must be an array", 400));
      }
    }
    if (bodyData.profileLayoutJson) {
      if (typeof bodyData.profileLayoutJson !== "object") {
        return next(
          new ErrorHandler("Profile layout must be a valid JSON object", 400)
        );
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
    if (req.files?.userImages && Array.isArray(req.files.userImages)) {
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

        // Only delete images if there are any
        if (Array.isArray(currentUserImages) && currentUserImages.length > 0) {
          await Promise.all(
            currentUserImages.map((img) => deleteFile(img.fileName))
          );
        } else {
          console.log("No user images provided for update.");
        }
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
    } else {
      console.info("No user images provided for update.");
    }

    // Handle companyImages - REPLACE instead of append
    if (req.files?.companyImages && Array.isArray(req.files.companyImages)) {
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

        // Only delete images if there are any
        if (
          Array.isArray(currentCompanyImages) &&
          currentCompanyImages.length > 0
        ) {
          await Promise.all(
            currentCompanyImages.map((img) => deleteFile(img.fileName))
          );
        } else {
          console.log("No company images provided for update.");
        }
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
    } else {
      console.info("No company images provided for update.");
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
    // New handling for profileLayoutJson
    if (bodyData.profileLayoutJson) {
      console.log("line 1226", bodyData.profileLayoutJson);

      // Stringify the JSON object to ensure it's stored correctly
      updateData.profileLayoutJSon = JSON.stringify(bodyData.profileLayoutJson);
    }

    console.log(updateData);
    // Define a custom character set without special characters
    const customChars =
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$#";
    shortId.characters(customChars);
    // Handle shortCode and shortUrl generation
    let shortCode = currentUser.shortCode;
    let shortUrl = currentUser.shortUrl;

    // If shortCode or shortUrl doesn't exist, generate new ones
    if (!shortCode || !shortUrl) {
      // Generate a new unique shortCode
      const generateUniqueShortCode = async () => {
        let newShortCode = shortId.generate().toLowerCase();
        const existingUser = await User.findOne({
          where: {
            [Op.or]: [
              { shortCode: newShortCode },
              { shortUrl: `https://xplr.live/profile/${newShortCode}` },
            ],
          },
        });

        // If shortCode or shortUrl already exists, regenerate
        if (existingUser) {
          return generateUniqueShortCode();
        }

        return newShortCode;
      };

      shortCode = await generateUniqueShortCode();
      shortUrl = `https://xplr.live/profile/${shortCode}`;

      updateData.shortCode = shortCode;
      updateData.shortUrl = shortUrl;
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
        profileLayoutJSon: updatedUser.profileLayoutJSon
          ? JSON.parse(updatedUser.profileLayoutJSon)
          : null,
        shortCode: shortCode,
        shortUrl: shortUrl,
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

//----------------logout user----------------------------------------
const logout = asyncHandler(async (req, res, next) => {
  try {
    const channel = req.headers["session"]?.trim();
    const userId = req.user?.id;

    // Validate user context
    if (!userId) {
      return next(new ErrorHandler("unauthenticated", 401));
    }
    // Check if channel exists in request
    if (!channel) {
      return next(new ErrorHandler("Missing session in headers", 400));
    }
    // Verify session only for web users, including OS information
    const session = await QRSession.findOne({
      where: {
        channel: channel,
      },
    });
    console.log(channel);

    if (!session) {
      return next(new ErrorHandler("Session not found", 404));
    }

    // Call deleteQRSession and handle its response
    const deleteResponse = await deleteQRSession(channel, userId);

    // If deleteQRSession fails, respond with the appropriate message and status
    if (!deleteResponse.success) {
      return res.status(deleteResponse.status).json({
        success: deleteResponse.success,
        message: deleteResponse.message,
      });
    }

    // Respond with success message if session is deleted successfully
    return res.status(200).json({
      success: true,
      message: "User Logout successful",
    });
  } catch (error) {
    console.error("Logout Error:", error);
    return next(
      new ErrorHandler(error.message || "An error occurred during logout", 500)
    );
  }
});

//----------------logout All user----------------------------------------
const logoutAll = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user?.id;

    // Validate user context
    if (!userId) {
      return next(new ErrorHandler("unauthenticated", 401));
    }
    // Verify session only for web users, including OS information
    const sessions = await QRSession.findAll({
      where: {
        userId: userId,
      },
    });
    console.log(sessions);

    if (sessions.length === 0) {
      return next(new ErrorHandler("No active sessions found", 404));
    }

    // Delete all sessions with transaction
    await db.sequelize.transaction(async (t) => {
      await Promise.all(
        sessions.map(async (session) => {
          if (session.isActiveSession) {
            await session.destroy({ transaction: t });
          }
        })
      );
    });

    // Respond with success message if sessions are deleted successfully
    return res.status(200).json({
      success: true,
      message: "All user sessions logged out successfully",
    });
  } catch (error) {
    console.error("Logout Error:", error);
    return next(
      new ErrorHandler(error.message || "An error occurred during logout", 500)
    );
  }
});

//----------------get enduser details----------------------------------------
const getUserProfile = asyncHandler(async (req, res, next) => {
  try {
    const id = req.params?.id;
    // First, verify the user exists
    const user = await User.findByPk(id);
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    const profileLayout = JSON.parse(user.profileLayoutJSon);
    res.status(200).json({
      success: true,
      message: "User Profile Layout",
      ProfileLayout: profileLayout,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
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

  // Start a database transaction for data integrity
  const transaction = await sequelize.transaction();
  // try {
  //   const visitorHistory = await client.getVisitorHistory(visitorId, {
  //     limit: 10,
  //   });
  //   console.log(JSON.stringify(visitorHistory, null, 2));
  //   console.log(response.response)
  // } catch (error) {
  //   // Ensure these error classes are imported or defined
  //   if (error && typeof error === 'object') {
  //     console.error('Error retrieving visitor history:', error);

  //     // More generic error handling
  //     if (error.status) {
  //       console.log('Error status:', error.status);
  //     }

  //     // Check for rate limiting specifically
  //     if (error.code === 'TOO_MANY_REQUESTS') {
  //       // Implement retry logic
  //       console.log('Rate limit exceeded. Retry after:', error.retryAfter);
  //       // Implement retryLater or use a retry mechanism
  //     }
  //   }
  // }

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

    // Log the visitorIds condition
    // const orConditions = findUserConditions.where[Op.or];
    // if (orConditions) {
    //   orConditions.forEach(condition => {
    //     if (condition.visitorIds) {
    //       console.log("Visitor IDs condition:", condition.visitorIds);
    //       console.log("Visitor ID in [Op.contains]:", condition.visitorIds[Op.contains]);
    //     }
    //   });
    // }

    // Look for existing users with either deviceId or visitorId
    let existingUser = await User.findOne(findUserConditions);
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

    const newUser = await User.create(
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

const getUserShortUrl = asyncHandler(async (req, res, next) => {
  try {
    if (!req.params?.shortCode) {
      return next(new ErrorHandler("Missing Short Code", 400));
    }
    const userShortCode = await User.findOne({
      where: { shortCode: req.params.shortCode },
    });

    if (!userShortCode) {
      return next(new ErrorHandler("User Short Code not found", 404));
    }
    const profileLayout = JSON.parse(userShortCode.profileLayoutJSon);
    res.status(200).json({
      success: true,
      message: "User Profile Layout",
      type: "profile",
      ProfileLayout: profileLayout,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = {
  registerUser,
  phoneVerification,
  sendPhoneOtp,
  sendOtp,
  emailVerification,
  loginUser,
  forgotPassword,
  resetPassword,
  getUserDetails,
  getUserByToken,
  getUserById,
  updateUser,
  deleteUser,
  getInsta,
  logout,
  logoutAll,
  getUserProfile,
  saveVisitorAndCampaign,
  getUserShortUrl,
};
