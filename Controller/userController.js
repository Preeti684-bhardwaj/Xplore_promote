const db = require("../dbConfig/dbConfig.js");
const User = db.users;
const QRSession = db.qrSessions;
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const sendEmail = require("../utils/sendEmail.js");
const { phoneValidation } = require("../utils/phoneValidation.js");
const {
  validateFiles,
} = require("../validators/campaignValidations.js");
const { deleteQRSession } = require("../utils/qrService.js");
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
require("dotenv").config();
const { KALEYRA_BASE_URL, KALEYRA_API_KEY, KALEYRA_FLOW_ID } = process.env;

// Kaleyra API configuration
const KALEYRA_CONFIG = {
  baseURL: KALEYRA_BASE_URL,
  apiKey: KALEYRA_API_KEY,
  flowId: KALEYRA_FLOW_ID,
};

//----------register user-------------------------
// const registerUser = asyncHandler(async (req, res, next) => {
//   try {
//     const { name, phone, email, password } = req.body;
//     // Validate all required fields
//     if ([name, phone, email, password].some((field) => field?.trim() === "")) {
//       return next(new ErrorHandler("All fields are required", 400));
//     }
//     // Validate input fields
//     if (!name) {
//       return next(new ErrorHandler("Name is missing", 400));
//     }
//     if (!phone) {
//       return next(new ErrorHandler("Phone is missing", 400));
//     }
//     if (!email) {
//       return next(new ErrorHandler("Email is missing", 400));
//     }
//     if (!password) {
//       return next(new ErrorHandler("Password is missing", 400));
//     }
//     // Sanitize name: trim and reduce multiple spaces to a single space
//     name.trim().replace(/\s+/g, " ");
//     // Convert the email to lowercase for case-insensitive comparison
//     const lowercaseEmail = email.toLowerCase();

//     // Validate name
//     const nameError = isValidLength(name);
//     if (nameError) {
//       return next(new ErrorHandler(nameError, 400));
//     }

//     const phoneError = isPhoneValid(phone);
//     if (phoneError) {
//       return next(new ErrorHandler(phoneError, 400));
//     }

//     // Validate email format
//     if (!isValidEmail(email)) {
//       return next(new ErrorHandler("Invalid email", 400));
//     }

//     // Check for existing user with the provided email or phone
//     const existingUser = await User.findOne({
//       where: {
//         [Op.or]: [{ email: lowercaseEmail }, { phone: phone }],
//       },
//     });

//     if (existingUser) {
//       if (existingUser.isEmailVerified) {
//         // If the user is already verified, block the attempt to create a new account
//         if (
//           existingUser.email.toLowerCase() === lowercaseEmail &&
//           existingUser.phone === phone
//         ) {
//           return next(new ErrorHandler("Account already exists", 409));
//         } else if (existingUser.email.toLowerCase() === lowercaseEmail) {
//           return next(new ErrorHandler("Email already in use", 409));
//         } else {
//           return next(new ErrorHandler("Phone number already in use", 409));
//         }
//       } else {
//         // Update the existing user's record with the new email and generate a new verification token
//         if (
//           existingUser.email.toLowerCase() === lowercaseEmail &&
//           existingUser.phone === phone
//         ) {
//           return next(new ErrorHandler("Account already exists", 409));
//         } else if (existingUser.email.toLowerCase() === lowercaseEmail) {
//           return next(new ErrorHandler("Email already in use", 409));
//         } else {
//           return next(new ErrorHandler("Phone number already in use", 409));
//         }
//       }
//     }
//     // If no existing user found, validate the password and create a new user
//     const passwordValidationResult = isValidPassword(password);
//     if (passwordValidationResult) {
//       return next(new ErrorHandler(passwordValidationResult, 400));
//     }
//     const hashedPassword = await hashPassword(password);
//     // Create a new user if no existing user is found
//     const user = await User.create({
//       name,
//       phone,
//       email,
//       password: hashedPassword,
//       authProvider: "local",
//     });

//     const userData = await User.findByPk(user.id, {
//       attributes: {
//         exclude: ["password", "otp", "otpExpire", "isEmailVerified"],
//       },
//     });

//     return res.status(201).json({
//       success: true,
//       message: "User registered successfully",
//       data: userData,
//     });
//   } catch (error) {
//     return next(new ErrorHandler(error.message, 500));
//   }
// });

const registerUser = asyncHandler(async (req, res, next) => {
  try {
    const { name, countryCode,phone, email, password } = req.body;
    // Validate required fields (phone excluded as it's optional)
    if ([name, email, password].some((field) => field?.trim() === "")) {
      return next(new ErrorHandler("All required fields must be filled", 400));
    }

    // Validate input fields
    if (!name) {
      return next(new ErrorHandler("Name is missing", 400));
    }
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
     return next(new ErrorHandler("Both country code and phone number are required", 400));
   }

   const phoneValidationResult = phoneValidation.validatePhone(countryCode, phone);
   
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
        countryCode: cleanedCountryCode
      }), // Only include phone if it's provided
      email,
      password: hashedPassword,
      authProvider: "local",
    });

    const userData = await User.findByPk(user.id, {
      attributes: {
        exclude: ["password", "otp", "otpExpire", "isEmailVerified"],
      },
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

//-----------send OTP-------------------------------
// const sendOtp = asyncHandler(async (req, res, next) => {
//   try {
//     const { email } = req.body;

//     // Check if the email field is provided and not empty after trimming
//     if (!email || email.trim() === "") {
//       return next(new ErrorHandler("Please provide email", 400));
//     }

//     // Validate email format
//     if (!isValidEmail(email)) {
//       return next(new ErrorHandler("Invalid email", 400));
//     }

//     // Convert the email to lowercase for case-insensitive comparison
//     const lowercaseEmail = email.toLowerCase().trim();

//     const user = await User.findOne({
//       where: { email: lowercaseEmail },
//     });

//     if (!user) {
//       return next(new ErrorHandler("User not found", 404));
//     }

//     const otp = generateOtp();

//     /*
//     Hi
//     To complete your verification, please use the One-Time Password (OTP) provided below.
//     This OTP is for single use and will expire after 15 minutes for security reasons.
//     Your verification code for Xplore Promote is: {OTP}
//     Please do not share this OTP with anyone. If you did not request this, please reach out to our support team immediately.
//     Best regards,
//     Xplore Promote Team
//     */

//     // Create HTML content for the email
//     const htmlContent = `
//   <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//     <h2>One-Time Password (OTP) Verification</h2>
//     <p>Dear ${user.name},</p>
//     <p>Your verification code for Xplore Promote is:</p>
//     <h1 style="font-size: 32px; background-color: #f0f0f0; padding: 10px; display: inline-block;">${otp}</h1>
//     <p>This code is valid for 15 minutes.</p>
//     <p>If you didn't request this code, please ignore this email.</p>
//     <p>Best regards,<br>Xplore Promote Team</p>
//   </div>
// `;
//     try {
//       await sendEmail({
//         email: user.email,
//         subject: `Xplore Promote: Your Verification Code`,
//         html: htmlContent,
//       });

//       user.otp = otp;
//       user.otpExpire = Date.now() + 15 * 60 * 1000; // 15 minutes
//       await user.save({ validate: false });

//       return res.status(200).json({
//         success: true,
//         message: `OTP sent to ${user.email} successfully`,
//         email: user.email,
//       });
//     } catch (emailError) {
//       user.otp = null;
//       user.otpExpire = null;
//       await user.save({ validate: false });

//       console.error("Failed to send OTP email:", emailError);
//       return next(new ErrorHandler(error.message, 500));
//     }
//   } catch (error) {
//     return next(new ErrorHandler(error.message, 500));
//   }
// });
const sendOtp = asyncHandler(async (req, res, next) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email || email.trim() === "") {
      return next(new ErrorHandler("Please provide email", 400));
    }
    // if (!phone || phone.trim() === "") {
    //   return next(new ErrorHandler("Please provide phone number", 400));
    // }

    // Validate email format
    if (!isValidEmail(email)) {
      return next(new ErrorHandler("Invalid email", 400));
    }

    const lowercaseEmail = email.toLowerCase().trim();

    // Find user
    const user = await User.findOne({
      where: { email: lowercaseEmail },
    });

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }
    if(user.isEmailVerified){
      return next(new ErrorHandler("Verified User",409))
    }
    const phone = user.phone;
    // // Format phone number to include country code if not present
    // const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;

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
          flow_id: KALEYRA_CONFIG.flowId,
          to: {
            mobile: phone,
            email: lowercaseEmail,
          },
        },
      });

      // Store verify_id in user record
      user.otp = response.data.data.verify_id;
      user.otpExpire = Date.now() + 5 * 60 * 1000; // 15 minutes
      await user.save({ validate: false });

      return res.status(200).json({
        success: true,
        message: `OTP sent successfully`,
        email: user.email
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

//---------User emailVerification------------------------------
// const emailVerification = asyncHandler(async (req, res, next) => {
//   try {
//     const { email, otp } = req.body;

//     // Validate the OTP
//     if (!otp || otp.trim() === "") {
//       return next(new ErrorHandler("OTP is required.", 400));
//     }

//     if (!email || email.trim() === "") {
//       return next(new ErrorHandler("Please provide email", 400));
//     }

//     // Validate email format
//     if (!isValidEmail(email)) {
//       return next(new ErrorHandler("Invalid email", 400));
//     }

//     // Convert the email to lowercase for case-insensitive comparison
//     const lowercaseEmail = email.toLowerCase().trim();

//     const user = await User.findOne({
//       where: { email: lowercaseEmail },
//     });
//     console.log(user);

//     if (!user) {
//       return next(new ErrorHandler("User not found", 404));
//     }

//     // Check OTP validity
//     if (user.otp !== otp) {
//       return next(new ErrorHandler("Invalid OTP", 400));
//     }
//     if (user.otpExpire < Date.now()) {
//       return next(new ErrorHandler("OTP has expired", 400));
//     }

//     // Update user details
//     user.isEmailVerified = true;
//     user.otp = null;
//     user.otpExpire = null;
//     await user.save();

//     const obj = {
//       type: "USER",
//       obj: user,
//     };
//     const accessToken = generateToken(obj);

//     return res.status(200).json({
//       success: true,
//       message: "Email verified successfully",
//       data: {
//         id: user.id,
//         name: user.name,
//         email: user.email,
//         phone: user.phone,
//       },
//       token: accessToken,
//     });
//   } catch (error) {
//     return next(new ErrorHandler(error.message, 500));
//   }
// });

const emailVerification = asyncHandler(async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    // Validate input
    if (!otp || otp.trim() === "") {
      return next(new ErrorHandler("OTP is required.", 400));
    }
    if (!email || email.trim() === "") {
      return next(new ErrorHandler("Please provide email", 400));
    }
    if (!isValidEmail(email)) {
      return next(new ErrorHandler("Invalid email", 400));
    }

    const lowercaseEmail = email.toLowerCase().trim();

    // Find user
    const user = await User.findOne({
      where: { email: lowercaseEmail },
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
        method: 'post',
        url: `${KALEYRA_CONFIG.baseURL}/verify/validate`,
        headers: {
          'Content-Type': 'application/json',
          'api-key': KALEYRA_CONFIG.apiKey
        },
        data: {
          verify_id: user.otp,
          otp: otp
        }
      });

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
        message: "Verification successful",
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
        },
        token: accessToken,
      });

    } catch (error) {
      // Handle Kaleyra API errors
      if (error.response?.data?.error) {
        const kaleyraError = error.response.data.error;
        return next(new ErrorHandler(kaleyraError.message || "Invalid OTP", 400));
      }
      throw error;
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//------------login user----------------------------------
const loginUser = async (req, res, next) => {
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

    if (!user.isEmailVerified) {
      return next(
        new ErrorHandler("Please verify your OTP before logging in", 403)
      );
    }
    const obj = {
      type: "USER",
      obj: user,
    };
    const accessToken = generateToken(obj);

    const loggedInUser = await User.findByPk(user.id, {
      attributes: {
        exclude: ["password", "otp", "otpExpire", "isEmailVerified"],
      },
    });

    return res.status(200).json({
      success: true,
      message: "Login successfully",
      data: loggedInUser,
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
};

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
    if (!user.isEmailVerified) {
      return next(new ErrorHandler("User is not verified", 403));
    }

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
    const userId = req.user?.id;
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
    if (!['personal', 'professional'].includes(type.toLowerCase())) {
      return next(new ErrorHandler("Type must be either 'personal' or 'professional'", 400));
    }

    // Fetch user from database
    const user = await User.findByPk(userId);
    
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    let responseData;

    // Prepare response based on type
    if (type.toLowerCase() === 'personal') {
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
        updatedAt: user.updatedAt
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
        updatedAt: user.updatedAt
      };
    }

    // Return success response
    return res.status(200).json({
      success: true,
      message: `${type.toLowerCase()} details fetched successfully`,
      data: responseData
    });

  } catch (error) {
    console.error("Get User Details Error:", error);
    return next(new ErrorHandler(error.message || "Error fetching user details", 500));
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
    const userId = req.user?.id;
    if (!userId) {
      return next(new ErrorHandler("User ID is required", 400));
    }

    // Parse JSON data if it's a string
    let bodyData = req.body.data ? 
      (typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data) 
      : req.body;

    // Validation checks
    if (bodyData.professionalEmail && (typeof bodyData.professionalEmail !== 'string' || bodyData.professionalEmail.toLowerCase().trim() === '')) {
      return next(new ErrorHandler('Please provide a valid email', 400));
    }
    if (bodyData.name && (typeof bodyData.name !== 'string' || bodyData.name.trim() === '')) {
      return next(new ErrorHandler('Please provide a valid name', 400));
    }
    
    if (bodyData.address && typeof bodyData.address !== 'object') {
      return next(new ErrorHandler('Address must be a valid object', 400));
    }
    
    if (bodyData.userWebsites) {
      if (!Array.isArray(bodyData.userWebsites)) {
        return next(new ErrorHandler('User websites must be an array', 400));
      } 
    }
    
    if (bodyData.companyWebsite && (typeof bodyData.companyWebsite !== 'string' || bodyData.companyWebsite.trim() === '')) {
      return next(new ErrorHandler('Company website must be a valid URL', 400));
    }

    // Get current user data
    const currentUser = await User.findByPk(userId);
    if (!currentUser) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Prepare update data
    let updateData = {
      updatedAt: new Date()
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
    return next(new ErrorHandler('Invalid Email', 400));
      }
      updateData.professionalEmail = newEmail;
    }
    // Handle userImages - REPLACE instead of append
    if (req.files?.userImages) {
      const fileError = validateFiles(req.files.userImages, 'user images');
      if (fileError) {
        return next(new ErrorHandler(fileError, 400));
      }

      // Delete existing user images from CDN
      let currentUserImages = [];
      try {
        currentUserImages = typeof currentUser.userImages === 'string' 
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
            uploadedAt: new Date().toISOString()
          });
        } catch (uploadError) {
          console.error(`Error uploading user image ${file.originalname}:`, uploadError);
          continue;
        }
      }

      updateData.userImages = newUserImages;
    }

    // Handle companyImages - REPLACE instead of append
    if (req.files?.companyImages) {
      const fileError = validateFiles(req.files.companyImages, 'company images');
      if (fileError) {
        return next(new ErrorHandler(fileError, 400));
      }

      // Delete existing company images from CDN
      let currentCompanyImages = [];
      try {
        currentCompanyImages = typeof currentUser.companyImages === 'string' 
          ? JSON.parse(currentUser.companyImages) 
          : currentUser.companyImages || [];
        
        // Delete existing images from CDN
        await Promise.all(
          currentCompanyImages.map((img) => deleteFile(img.fileName))
        );
      } catch (error) {
        console.error("Error parsing or deleting current companyImages:", error);
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
            uploadedAt: new Date().toISOString()
          });
        } catch (uploadError) {
          console.error(`Error uploading company image ${file.originalname}:`, uploadError);
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
      return next(new ErrorHandler(`Failed to update user with id=${userId}`, 404));
    }

    // Return success response
    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        userImages: updatedUser.userImages,
        companyImages: updatedUser.companyImages,
        address: updatedUser.address,
        userWebsites: updatedUser.userWebsites,
        companyWebsite: updatedUser.companyWebsite,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt
      }
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

module.exports = {
  registerUser,
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
};
