const jwt = require("jsonwebtoken");
const db = require("../dbConfig/dbConfig.js");
const bcrypt = require("bcrypt");
const User = db.users;
const { isValidEmail } = require("./validation.js");
require("dotenv").config();

// Helper function to generate JWT
const generateToken = (user) => {
  try {
    if (!user || !process.env.JWT_SECRET) {
      return {
        success: false,
        status: 500,
        message: "Invalid token generation parameters",
      };
    }
    return jwt.sign({ obj: user }, process.env.JWT_SECRET, {
      expiresIn: "72h",
    });
  } catch (error) {
    console.error("Token generation error:", error);
    return {
      success: false,
      status: 500,
      message: error.message || "Failed to generate authentication token",
    };
  }
};
// Helper function to generate
const generateOtp = () => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    if (otp.length !== 6) {
      return {
        success: false,
        status: 500,
        message: "OTP generation failed",
      };
    }
    return otp;
  } catch (error) {
    console.error("OTP generation error:", error);
    return {
      success: false,
      status: 500,
      message: error.message || "Failed to generate OTP",
    };
  }
};

const hashPassword = async (password) => {
  return bcrypt.hash(password, 10);
};

// Helper function to validate Apple ID token
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

// Helper function to create or update user
const createOrUpdateUser = async (
  email,
  name,
  appleUserId,
  decodedAppleId,
  decodedToken
) => {
  try {
    const appleId = decodedAppleId || appleUserId;
    if (!appleId) {
      return {
        success: false,
        status: 400,
        message: "Apple User ID is required",
      };
    }

    let user = await User.findOne({
      where: { appleUserId: appleId },
    });

    if (!user) {
      if (!email || !name || !appleUserId) {
        return {
          success: false,
          status: 400,
          message: "Email, name and appleUserId are required",
        };
      }

      if (decodedToken.email && !isValidEmail(decodedToken.email)) {
        return {
          success: false,
          status: 400,
          message: "Invalid email format",
        };
      }

      const userName = decodedToken.name
        ? `${decodedToken.name.firstName} ${decodedToken.name.lastName}`
        : null;

      user = await User.create({
        appleUserId: appleId,
        email: decodedToken.email || email,
        name: userName || name,
        isEmailVerified: true,
        authProvider: "apple",
        IsActive: true,
      });
      if (!user) {
        return res.status(500).json({
          success: false,
          message: "Failed to create a new user",
        });
      }
    }

    if (!user.IsActive) {
      return {
        success: false,
        status: 403,
        message: "User account is inactive",
      };
    }
    return res.status(200).json({
      success: true,
      message: "User found or created successfully",
      data: user,
    });
  } catch (error) {
    console.error("User creation/update error:", error);
    return {
      success: false,
      status: 500,
      message: error.message || "Failed to process user account",
    };
  }
};

module.exports = {
  generateToken,
  generateOtp,
  hashPassword,
  validateAppleToken,
  createOrUpdateUser,
};
