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

// Update Existing User with Apple ID
async function updateExistingUserWithAppleId(
  user,
  { deviceId, visitorId },
  transaction
) {
  const updates = {};

  // Add unique device IDs
  if (deviceId && !user.deviceId.includes(deviceId)) {
    updates.deviceId = [...new Set([...user.deviceId, deviceId])];
  }

  // Add unique visitor IDs
  if (visitorId && !user.visitorIds.includes(visitorId)) {
    updates.visitorIds = [...new Set([...user.visitorIds, visitorId])];
  }

  // Update if there are changes
  if (Object.keys(updates).length > 0) {
    return await user.update(updates, { transaction });
  }

  return user;
}

// Update User with Apple Details
async function updateUserWithAppleDetails(
  user,
  { appleUserId, email, name, deviceId, visitorId },
  campaignID,
  transaction
) {
  const updates = {
    appleUserId,
    ...(email && {
      email: email.toLowerCase(),
      isEmailVerified: true,
    }),
    ...(name && { name: name.trim() }),
    deviceId: [...new Set([...user.deviceId, deviceId])],
    visitorIds: visitorId
      ? [...new Set([...user.visitorIds, visitorId])]
      : user.visitorIds,
  };

  await user.update(updates, { transaction });

  // Add campaign if not already associated
  if (!user.campaigns || user.campaigns.length === 0) {
    await user.addCampaign(campaignID, { transaction });
  }

  return user;
}

// Create New User
async function createNewUser(
  { appleUserId, email, name, deviceId, visitorId },
  campaignID,
  transaction
) {
  const user = await User.create(
    {
      appleUserId,
      email: email?.trim().toLowerCase(),
      name: name?.trim(),
      authProvider: "apple",
      deviceId: [deviceId],
      visitorIds: visitorId ? [visitorId] : [],
      isEmailVerified: !!email,
    },
    { transaction }
  );

  await user.addCampaign(campaignID, { transaction });
  return user;
}

const createOrUpdateUser = async (
    email,
    name,
    appleUserId,
    decodedAppleId,
    decodedToken,
    transaction // Pass the transaction object
  ) => {
    try {
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
      // Check if user is active
      // if (!user.IsActive) {
      //   return {
      //     success: false,
      //     status: 403,
      //     message: "User account is inactive",
      //   };
      // }
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
  updateExistingUserWithAppleId,
  updateUserWithAppleDetails,
  createNewUser,
};