const passport = require('passport');
const AppleStrategy = require('passport-apple');
const jwt = require('jsonwebtoken');
const db = require("../dbConfig/dbConfig.js");
const User = db.users;
const axios = require('axios');
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const sendEmail = require("../utils/sendEmail.js");
const crypto = require("crypto");
const {
  isValidEmail,
  isValidPassword,
  isValidLength,
} = require("../utils/validation.js");

// Helper function to generate JWT
const generateToken = (user) => {
  return jwt.sign({ obj: user }, process.env.JWT_SECRET, {
    expiresIn: "72h", // expires in 24 hours
  });
};

// OTP validity period in seconds (e.g., 15 minutes)
const OTP_VALIDITY = 15 * 60;

// Generate OTP
// const generateOtp = () => {
//   return Math.floor(100000 + Math.random() * 900000).toString();
// };

// Helper function to generate API key
// const generateApiKey = () => {
//   return crypto.randomBytes(32).toString("hex");
// };

// ---------------apple signin---------------------------------
// Configure Apple Strategy
// passport.use(new AppleStrategy({
//   clientID: process.env.APPLE_CLIENT_ID,
//   teamID: process.env.APPLE_TEAM_ID,
//   callbackURL: process.env.APPLE_CALLBACK_URL,
//   keyID: process.env.APPLE_KEY_ID,
//   privateKeyLocation: process.env.APPLE_PRIVATE_KEY_LOCATION,
//   passReqToCallback: true
// }, async function(req, accessToken, refreshToken, idToken, profile, cb) {
//   try {
//     const decodedToken = jwt.decode(idToken);
//     const appleUserId = decodedToken.sub;
    
//     let user = await User.findOne({ where: { appleUserId: appleUserId } });
    
//     if (!user) {
//       // Create a new user if not found
//       user = await User.create({
//         appleUserId: appleUserId,
//         email: decodedToken.email,
//         name: decodedToken.name ? `${decodedToken.name.firstName} ${decodedToken.name.lastName}` : null,
//         isEmailVerified: true, // Apple has verified the email
//         authProvider: 'apple',
//         IsActive: true,
//       });
//     }
    
//     return cb(null, user);
//   } catch (error) {
//     return cb(error);
//   }
// }));

// // Apple Sign In route
const handleSIWALogin = async (req, res) => {
  const authorizationCode = req.body.token; // 1
  
  // Prepare the request body as URL-encoded string
  const body = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID,
    client_secret:process.env.APPLE_TEAM_ID,
    code: authorizationCode,
    grant_type: 'authorization_code'
  }).toString();

  try {
    // Make a POST request to Apple’s API to exchange authorization code for tokens
    const response = await axios.post('https://appleid.apple.com/auth/token', body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }); // 2

    const data = response.data; // 3
    const idToken = data.id_token;

    // Decode the ID token to get the user’s information
    const base64Payload = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payloadBuffer = Buffer.from(base64Payload, 'base64');
    const payload = JSON.parse(payloadBuffer.toString()); // 4

    // Check if payload contains an email
    if (payload.email) {
      return res.status(200).send({status:true , data:payload})
      // return createOrLogUser(payload, res); // 5
    } else {
      return respondWithError("Could not authenticate with this token", res);
    }
  } catch (error) {
    console.error('Error during SIWA login:', error.message);
    return respondWithError(error.message, res); // 6
  }
};

// Function to create a new user or log in an existing user based on the payload
function createOrLogUser(payload, res) {
  const token = generateToken({ type: "USER", obj: user });
  // Implement the logic to create or find a user based on the payload (e.g., using payload.email)
  // For demonstration purposes, we'll just return a success response
  return res.json({ success: true, message: 'User authenticated successfully', user: payload , token:token});
}

// Function to respond with an error message
function respondWithError(message, res) {
  return res.status(400).json({ success: false, error: message });
}

// ---------------FORGET PASSWORD-----------------------------------------------------
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send({ message: "Missing email id" });
  }

  if (!isValidEmail(email)) {
    return res.status(400).send({ message: "Invalid email address" });
  }

  let user;

  try {
    user = await User.findOne({
      where: {
        email: email.trim(),
      },
    });

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    if (!user.isEmailVerified) {
      return res.status(400).send({ message: "User is not verified" });
    }

    // Get ResetPassword Token
    const otp = user.generateOtp(); // Assuming you have a method to generate the OTP
    user.otp = otp;
    user.otpExpire = Date.now() + 15 * 60 * 1000; // Set OTP expiration time (e.g., 15 minutes)

    await user.save({ validate: false });

    // Create HTML content for the email
    // <img src="https://stream.xircular.io/AIengage.png" alt="AI Engage Logo" style="max-width: 200px; margin-bottom: 20px;">
    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Request</h2>
      <p>Hello,</p>
       <p>Your One Time Password (OTP) for Xplore Promote is:</p>
      <p>You have requested a password reset for your Xplore Promote account.</p>
        <p>Your One Time Password (OTP) for Xplore Promote is:</p>
      <h1 style="font-size: 32px; background-color: #f0f0f0; padding: 10px; display: inline-block;">${otp}</h1>
      <p>This OTP is valid for 15 minutes.</p>
      <p>If you didn't request this password reset, please ignore this email.</p>
      <p>Best regards,<br>Xplore Promote Team</p>
    </div>
    `;

    await sendEmail({
      email: user.email,
      subject: `Xplore Promote: Password Reset Request`,
      html: htmlContent
    });

    res.status(200).json({
      success: true,
      message: `Password reset otp sent to ${user.email}`,
    });
  } catch (error) {
    user.otp = null;
    user.otpExpire = null;
    await user.save({ validate: false });

    return res.status(500).send(error.message);
  }
};

// ---------------RESET PASSWORD------------------------------------------------------------
const resetPassword = async (req, res) => {
    const { password, otp } = req.body;
    const userId = req.params.userId;

  // Validate input fields
  if ([ password, otp].some((field) => field?.trim() === "")) {
    return res.status(400).send({
      success: false,
      message: "Please provide necessary field",
    });
  }
  const passwordValidationResult = isValidPassword(password);
  if (passwordValidationResult) {
    return res.status(400).send({
      success: false,
      message: passwordValidationResult,
    });
  }
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    // Find the user by reset token
    const user = await User.findByPk(userId);
    if (!user) {
         return res.status(400).send({ message:"User not found"});
      }
  
      // Verify the OTP
      if (user.otp !== otp.trim()) {
        return res.status(400).send({ message:"Invalid OTP"});
      }
      if (user.otpExpire < Date.now()) {
        return res.status(400).send({ message:"Expired OTP"});
      }
  
      // Update the user's password and clear OTP fields
      user.password = password;
      user.otp = null;
      user.otpExpire = null;
  
      await user.save({ validate: true });

    if (!user) {
      return res.status(400).send({ message: "Invalid or expired token" });
    }

    // Update the user's password and clear token fields
    user.password = hashedPassword;
    user.resetToken = null;
    user.resetTokenExpire = null;

    await user.save({ validate: true });

    // Exclude password from the response
    const updatedUser = await user.findByPk(user.id, {
      attributes: {
        exclude: ["password"],
      },
    });

    return res.status(200).json({
      success: true,
      message: `Password updated for ${updatedUser.email}`,
    });
  } catch (error) {
    return res.status(500).send(error.message);
  }
};

// ===================get user by id------------------------------------

// const getUserById = asyncHandler(async (req, res, next) => {
//   try {
//     const id = req.params.userId;
//     const item = await Customer.findByPk(id, {
//       attributes: { exclude: ["password"] },
//     });
//     if (!item) {
//       res.status(404).json({ success: false, error: "User not found" });
//     } else {
//       res.json({ success: true, data: item });
//     }
//   } catch (error) {
//     return res.status(500).send(error.message);
//   }
// });

// delete user through phone
// const deleteUser = asyncHandler(async (req, res, next) => {
//   const { phone } = req.body;
//   try {
//     const user = await Customer.findOne({ where: { phone: phone } });
//     console.log(user);
//     if (!user) {
//       return res.status(400).json({
//         success: false,
//         message: "User not found or invalid details.",
//       });
//     }
//     await user.destroy();
//     res.status(200).send({
//       success: true,
//       message: `user with phone ${user.phone} deleted successfully`,
//     });
//   } catch (err) {
//     return res.status(500).send({
//       success: false,
//       message: err.message,
//     });
//   }
// });

// delete all user
// const deleteAllUsers = async (req, res) => {
//   try {
//     await Customer.destroy({
//       where: {}, // Empty condition means all records
//     });

//     res
//       .status(200)
//       .json({ message: "All users have been deleted successfully." });
//   } catch (error) {
//     console.error("Error deleting users:", error);
//     res
//       .status(500)
//       .json({ message: "An error occurred while deleting users." });
//   }
// };

// get All user
// const getUser = asyncHandler(async (req, res, next) => {
//   try {
//     const item = await Customer.findAll({
//       attributes: { exclude: ["password"] },
//     });
//     if (!item) {
//       res.status(404).json({ success: false, error: "User not found" });
//     } else {
//       res.json({ success: true, data: item });
//     }
//   } catch (error) {
//     return res.status(500).send({
//       success: false,
//       message: err.message,
//     });
//   }
// });

module.exports = {
  // userSignup,
  // sendOtp,
  // emailOtpVerification,
  // appleSignIn,
  // appleSignInCallback,
  // userSignin,
  handleSIWALogin,
  forgotPassword,
  resetPassword
//   getUserById,
//   freeTrial,
//   deleteAllUsers,
  // logOut,
//   deleteUser,
//   getUser,
};
