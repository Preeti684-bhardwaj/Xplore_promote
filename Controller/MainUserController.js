const db = require("../dbConfig/dbConfig.js");
const User = db.users;
const sequelize = db.sequelize;
require("dotenv").config();
const {generateToken,createOrUpdateUser,validateAppleToken} = require("../validators/userValidation.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");
const { CLIENT_ID, ANDROID_ENDUSER_CLIENT_ID, WEB_ENDUSER_CLIENT_ID } =
  process.env;
const { OAuth2Client } = require("google-auth-library");
const { isValidEmail} = require("../validators/validation.js");

const googleClient = new OAuth2Client({
  clientId: CLIENT_ID || ANDROID_ENDUSER_CLIENT_ID || WEB_ENDUSER_CLIENT_ID
});

const verifyGoogleLogin= async(idToken)=> {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: [
        CLIENT_ID, 
        ANDROID_ENDUSER_CLIENT_ID, 
        WEB_ENDUSER_CLIENT_ID
      ]
    });
    
    const payload = ticket.getPayload();
    console.log("Full token payload:", JSON.stringify(payload, null, 2));
    console.log("Token audience:", payload.aud);
    
    return payload;
  } catch (error) {
    console.error("Detailed error verifying Google token:", {
      message: error.message,
      stack: error.stack
    });
    return null;
  }
}

// ---------------apple signin---------------------------------
const appleLogin = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const authHeader = req.headers["authorization"];
    const idToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;
    // Extract and validate inputs
    const { email, name, appleUserId } = req.body;
    const decodedToken = validateAppleToken(idToken);
    console.log("decodedToken", decodedToken);
    // Pass the transaction to the createOrUpdateUser function
    const userResponse = await createOrUpdateUser(
      email,
      name,
      appleUserId,
      decodedToken.sub,
      decodedToken,
      transaction
    );
    // Check if the response indicates an error
    if (!userResponse.success) {
      console.error("User creation/update error:", userResponse.message);
      await transaction.rollback(); // Rollback the transaction
      return res.status(userResponse.status).json({
        success: false,
        message: userResponse.message,
      });
    }
      
    const user = userResponse.data;
    console.log("appleUserId", decodedToken.sub);
    const obj = {
      type: "USER",
      obj:{
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  
    const accessToken = generateToken(obj);
    console.log("user after createOrUpdateUser function", user);

    // Audit log for successful login
    console.log(`Successful Apple login for user ID: ${user.appleUserId}`);

    await transaction.commit(); // Commit the transaction

    return res.status(200).json({
      status: true,
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        appleUserId: user.appleUserId,
      },
      token:accessToken
    });
  }catch (error) {
    console.error("Apple login error:", error);
    await transaction.rollback(); // Rollback the transaction on error
    return next(new ErrorHandler(error.message, 500));
  }
});

//-----------------google signin------------------
const googleLogin = asyncHandler(async (req, res, next) => {
  // Start a transaction
  const transaction = await db.sequelize.transaction();

  try {
    // Get token from Authorization header and remove 'Bearer ' if present
    const authHeader = req.headers["authorization"];
    const idToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;
  
    if (!idToken || idToken === "null") {
     return next(new ErrorHandler("No authentication token provided", 401));
    }
     
    // Verify Google token
    let googlePayload;
    try {
      googlePayload = await verifyGoogleLogin(idToken);
    } catch (error) {
      await transaction.rollback();
      if (error.message.includes("Token used too late")) {
        return next(
          new ErrorHandler(
            "Authentication token has expired. Please login again.",
            401
          )
        );
      }
      return next(new ErrorHandler("Invalid authentication token", 401));
    }

    if (!googlePayload?.sub) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid Google account information", 400));
    }

    // Try to find user by Google ID or email
    let user = await User.findOne({ 
      where: {
        [db.Sequelize.Op.or]: [
          { googleUserId: googlePayload.sub },
          { email: googlePayload.email }
        ]
      },
      transaction // Pass transaction to findOne
    });

    if (!user) {
      // Validate email if present
      if (googlePayload.email && !isValidEmail(googlePayload.email)) {
        await transaction.rollback();
        return next(new ErrorHandler("Invalid email format from Google account", 400));
      }
      
      try {
        // Create new user within transaction
        user = await User.create({
          email: googlePayload.email,
          name: googlePayload.name,
          googleUserId: googlePayload.sub,
          isEmailVerified: true,
          authProvider: "google",
          IsActive: true
        }, { transaction }); // Pass transaction to create
      } catch (error) {
        await transaction.rollback();
        console.error("Error creating user:", error);
        if (error.name === 'SequelizeUniqueConstraintError') {
          return next(new ErrorHandler("Account already exists with this email", 409));
        }
        throw error;
      }
    } else {
      // Update existing user's Google information within transaction
      await user.update({
        googleUserId: googlePayload.sub,
        name: user.name || googlePayload.name
      }, { transaction });
    }

    if (!user.IsActive) {
      await transaction.rollback();
      return next(new ErrorHandler("This account has been deactivated", 403));
    }

    // Commit transaction
    await transaction.commit();

    const obj = {
      type: "USER",
      obj: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
    
    const accessToken = generateToken(obj);
    
    // Return response
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
    // Ensure transaction is rolled back in case of any unexpected error
    await transaction.rollback();
    
    // Log and handle errors
    console.error("Google login error:", error);
    return next(new ErrorHandler(error.message || "An error occurred during login. Please try again later.", 500));
  }
});

module.exports = {
  appleLogin,
  googleLogin
};
