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
  decodedToken,
  transaction // Pass the transaction object
) => {
  try {
    // console.log("requestname", name);

    const appleId = appleUserId || decodedAppleId;
    if (!appleId) {
      return {
        success: false,
        status: 400,
        message: "Apple User ID is required",
      };
    }

    // Add detailed logging to understand the token structure
    console.log("Decoded Token:", JSON.stringify(decodedToken, null, 2));

    // Determine email with multiple fallback options
    const userEmail = email || decodedToken.email;

    // Validate email if provided
    if (userEmail && !isValidEmail(userEmail)) {
      return {
        success: false,
        status: 400,
        message: "Invalid email format",
      };
    }

    let user = await User.findOne({
      where: { appleUserId: appleId },
      transaction,
    });

    if (!user) {
      const userName = name;
      user = await User.create(
        {
          appleUserId: appleId,
          email: userEmail,
          name: userName,
          isEmailVerified: decodedToken.email_verified || false,
          authProvider: "apple",
          IsActive: true,
        },
        { transaction }
      );

      if (!user) {
        return {
          success: false,
          status: 500,
          message: "Failed to create a new user",
        };
      }
    }

    if (!user.IsActive) {
      return {
        success: false,
        status: 403,
        message: "User account is inactive",
      };
    }

    return {
      success: true,
      data: user,
    };
  } catch (error) {
    console.error("User creation/update error:", error);
    throw error; // Ensure error bubbles up for transaction rollback
  }
};

module.exports = {
  generateToken,
  generateOtp,
  hashPassword,
  validateAppleToken,
  createOrUpdateUser,
};
