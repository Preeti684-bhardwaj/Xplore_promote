const passport = require("passport");
const jwt = require("jsonwebtoken");
const db = require("../dbConfig/dbConfig.js");
require("dotenv").config();
const {CLIENT_ID} = process.env
const User = db.users;
const { OAuth2Client } = require('google-auth-library');
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");
const {
  isValidEmail,
  isPhoneValid,
} = require("../validators/validation.js");
const {generateToken}=require("../validators/userValidation.js")

const googleClient = new OAuth2Client({
  clientId: process.env.CLIENT_ID
});

async function verifyGoogleLogin(idToken) {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: CLIENT_ID
  });
  const payload = ticket.getPayload();
  return payload
  } catch (error) {
    console.error("Error verifying Google token:", error);
    return null;
  }
}
//-----------------google signin------------------
const googleLogin =asyncHandler(async (req, res,next) => {
  try {
    // Get token from Authorization header and remove 'Bearer ' if present
    const authHeader = req.headers["authorization"];
    const idToken = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;

    if (!idToken || idToken === "null") {
     return next(new ErrorHandler("No authentication token provided",401));
    }

    let googlePayload;
    try {
      googlePayload = await verifyGoogleLogin(idToken);
    } catch (error) {
      if (error.message.includes('Token used too late')) {
      return next(new ErrorHandler("Authentication token has expired. Please login again.",401));
      }
      return next(new ErrorHandler("Invalid authentication token",401));
    }

    if (!googlePayload?.sub) {
     return next(new ErrorHandler("Invalid Google account information",400));
    }

    // Try to find user by Google ID or email
    let user = await User.findOne({ 
      where: {
        [db.Sequelize.Op.or]: [
          { googleUserId: googlePayload.sub },
          { email: googlePayload.email }
        ]
      }
    });

    if (!user) {
      // Validate email if present
      if (googlePayload.email && !isValidEmail(googlePayload.email)) {
        return next(new ErrorHandler("Invalid email format from Google account",400));
      }

      try {
        // Create new user
        user = await User.create({
          email: googlePayload.email,
          name: googlePayload.name,
          googleUserId: googlePayload.sub,
          isEmailVerified:true,
          authProvider: "google",
          IsActive: true
        });
      } catch (error) {
        console.error("Error creating user:", error);
        if (error.name === 'SequelizeUniqueConstraintError') {
          return next(new ErrorHandler("Account already exists with this email" ,409));
        }
        throw error;
      }
    } else {
      // Update existing user's Google information
      await user.update({
        googleUserId: googlePayload.sub,
        name: user.name || googlePayload.name
      });
    }

    if (!user.IsActive) {
      return next(new ErrorHandler("This account has been deactivated",403));
    }

    const obj = {
      type: "USER",
      obj: user,
    };
    const accessToken = generateToken(obj);

    return res.status(200).json({
      status: true,
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        isEmailVerified: user.isEmailVerified,
        phone: user.phone
      },
      token: accessToken,
    });
  } catch (error) {
    console.error("Google login error:", error);
   return next(new ErrorHandler(error.message||"An error occurred during login. Please try again later.",500));
  }
});

//-------------------add phone--------------------------
const googlePhone = asyncHandler(async (req, res,next) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return next(new ErrorHandler("Missing phone number",400));
    }

    const phoneError = isPhoneValid(phone);
    if (phoneError) {
      return next(new ErrorHandler(phoneError,400));
    }

    if (!req.decodedToken || !req.decodedToken.obj || !req.decodedToken.obj.obj || !req.decodedToken.obj.obj.id) {
      return next(new ErrorHandler("Invalid or missing token",401 ));
    }

    const userId = req.decodedToken.obj.obj.id;
    const user = await User.findOne({ where: { id: userId } });

    if (!user) {
      return next(new ErrorHandler("User not found",404));
    }

    if (!user.isEmailVerified) {
      return next(new ErrorHandler("Email not verified. Please verify your email first.",403));
    }

    if (user.phone) {
      return next(new ErrorHandler("Phone number already exists for this user",409));
    }

    user.phone = phone;
    await user.save();

    return res.status(200).json({
      status: true,
      message: "Phone number added successfully",
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("Error in googlePhone:", error);
    return next(new ErrorHandler(error.message,500));
  }
});

module.exports = {
  googleLogin,
  googlePhone
};
