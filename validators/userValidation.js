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


// Process User
async function processUser({
  existingUser,
  decodedToken,
  email,
  name,
  appleUserId,
  deviceId,
  visitorId,
  campaignID,
  transaction,
}) {
  let user;
  let userStatus = "existing";

  if (existingUser) {
    // Scenario 1: User exists with visitorId, but has null email, name, and appleUserId
    if (!existingUser.email && !existingUser.name && !existingUser.appleUserId) {
      user = await updateUserWithAppleDetails(
        existingUser,
        {
          appleUserId: decodedToken.sub,
          email,
          name,
          deviceId,
          visitorId,
        },
        campaignID,
        transaction
      );
    } 
    // Scenario 2: User exists with Apple User ID
    else if (existingUser.appleUserId) {
      user = await updateExistingUserWithAppleId(
        existingUser,
        { deviceId, visitorId },
        transaction
      );
    } 
    // Scenario 3: User exists without Apple User ID
    else {
      user = await updateUserWithAppleDetails(
        existingUser,
        {
          appleUserId: decodedToken.sub,
          email,
          name,
          deviceId,
          visitorId,
        },
        campaignID,
        transaction
      );
    }
  } else {
    // Scenario 4: Create new user
    user = await createNewUser(
      {
        appleUserId: decodedToken.sub,
        email,
        name,
        deviceId,
        visitorId,
      },
      campaignID,
      transaction
    );
    userStatus = "new";
  }

  return [user, userStatus];
}

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
// Determine User Message
function getUserMessage(userStatus) {
  return userStatus === "new" ? "Signup successful" : "Login successful";
}

// Format User Response
function formatUserResponse(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    appleUserId: user.appleUserId,
    deviceId: user.deviceId,
    visitorIds: user.visitorIds,
    isEmailVerified: user.isEmailVerified,
  };
}

// Process User
async function processgmailUser(existingUser, googlePayload, campaignID, transaction) {
  // Validate email if present
  if (googlePayload.email && !isValidEmail(googlePayload.email)) {
    throw new ErrorHandler("Invalid email format from Google account", 400);
  }

  let user;
  if (!existingUser) {
    // Create new user
    try {
      user = await User.create({
        email: googlePayload.email,
        name: googlePayload.name,
        googleUserId: googlePayload.sub,
        isEmailVerified: true,
        authProvider: "google",
        IsActive: true,
      }, { transaction });
    } catch (error) {
      if (error.name === "SequelizeUniqueConstraintError") {
        throw new ErrorHandler("Account already exists with this email", 409);
      }
      throw error;
    }
  } else {
    // Update existing user
    user = await updategmailExistingUser(existingUser, googlePayload, transaction);

    // Check if user is active
    if (!user.IsActive) {
      throw new ErrorHandler("This account has been deactivated", 403);
    }
  }

  return user;
}

// Update Existing User
async function updategmailExistingUser(existingUser, googlePayload, transaction) {
  return await existingUser.update({
    googleUserId: googlePayload.sub,
    name: existingUser.name || googlePayload.name,
  }, { transaction });
}

// Format User Response
function formatgmailUserResponse(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isEmailVerified: user.isEmailVerified,
    phone: user.phone,
  };
}

module.exports = {
  generateToken,
  generateOtp,
  hashPassword,
  validateAppleToken,
  // createOrUpdateUser,
  processUser,
  updateExistingUserWithAppleId,
  updateUserWithAppleDetails,
  createNewUser,
  getUserMessage,
  formatUserResponse,
  processgmailUser,
  formatgmailUserResponse
};
