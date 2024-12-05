const db = require("../dbConfig/dbConfig.js");
const User = db.users;
const Campaign = db.campaigns;
const { Op } = require("sequelize");
const sequelize = db.sequelize;
require("dotenv").config();
const {
  generateToken,
  createOrUpdateUser,
  validateAppleToken,
} = require("../validators/userValidation.js");
// const { isPhoneValid } = require("../validators/validation.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");
const { CLIENT_ID, ANDROID_ENDUSER_CLIENT_ID, WEB_ENDUSER_CLIENT_ID } =
  process.env;
const { OAuth2Client } = require("google-auth-library");
const { isValidEmail} = require("../validators/validation.js");

const googleClient = new OAuth2Client({
  clientId: CLIENT_ID || ANDROID_ENDUSER_CLIENT_ID || WEB_ENDUSER_CLIENT_ID
});

async function verifyGoogleLogin(idToken) {
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
const googleLogin =asyncHandler(async (req, res,next) => {
    try {
      // Get token from Authorization header and remove 'Bearer ' if present
      const authHeader = req.headers["authorization"];
      const idToken = authHeader?.startsWith("Bearer ")
        ? authHeader.substring(7)
        : authHeader;
    
      if (!idToken || idToken === "null") {
       return next(new ErrorHandler("No authentication token provided",401));
      }
       // Verify Google token
      let googlePayload;
      try {
        googlePayload = await verifyGoogleLogin(idToken);
      } catch (error) {
        if (error.message.includes("Token used too late")) {
          return next(
            new ErrorHandler(
              "Authentication token has expired. Please login again.",
              401
            )
          );
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
      // Commit transaction
      await transaction.commit();
  
      const obj = {
        type: "USER",
        obj:{
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
      // Rollback transaction
      await transaction.rollback();
      // Log and handle errors
      console.error("Google login error:", error);
     return next(new ErrorHandler(error.message||"An error occurred during login. Please try again later.",500));
    }
  });
  
//----------------Add phone number--------------------------------------------------
// const applePhone = asyncHandler(async (req, res, next) => {
//   try {
//     const { phone } = req.body;
//     const userId = req.user?.id;

//     // Input validation
//     if (!phone) {
//       return next(new ErrorHandler("Missing phone number", 400));
//     }

//     if (!userId) {
//       return next(new ErrorHandler("Invalid authentication token", 401));
//     }

//     const phoneError = isPhoneValid(phone);
//     if (phoneError) {
//       return next(new ErrorHandler(phoneError, 400));
//     }

//     // Find and validate user
//     const user = await User.findOne({
//       where: { id: userId },
//     });

//     if (!user) {
//       return next(new ErrorHandler("User not found", 404));
//     }

//     if (!user.isEmailVerified) {
//       return next(
//         new ErrorHandler(
//           "Email not verified. Please verify your email first.",
//           403
//         )
//       );
//     }

//     // Check for duplicate phone number across all users
//     const existingPhoneUser = await User.findOne({
//       where: {
//         phone,
//         id: { [Op.ne]: userId }, // Exclude current user
//       },
//     });

//     if (existingPhoneUser) {
//       return next(
//         new ErrorHandler(
//           "Phone number already registered to another account",
//           409
//         )
//       );
//     }

//     if (user.phone) {
//       return next(
//         new ErrorHandler("Phone number already exists for this user", 409)
//       );
//     }

//     // Update phone number with retry logic
//     let retries = 3;
//     while (retries > 0) {
//       try {
//         await user.update({
//           phone,
//         });
//         break;
//       } catch (error) {
//         retries--;
//         if (retries === 0) throw error;
//         await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retry
//       }
//     }

//     // Audit log for phone number update
//     console.log(`Phone number updated for user ID: ${user.id}`);

//     return res.status(200).json({
//       status: true,
//       message: "Phone number added successfully",
//       user: {
//         id: user.id,
//         email: user.email,
//         phone: user.phone,
//       },
//     });
//   } catch (error) {
//     console.error("Phone update error:", error);
//     return next(new ErrorHandler(error.message, 500));
//   }
// });

// ---------------get user by appleUserId ---------------------------------
// const getUserByAppleUserId = asyncHandler(async (req, res, next) => {
//   try {
//     const idToken = req.headers["authorization"];
//     const decodedToken = validateAppleToken(idToken);
//     const { appleUserId } = req.params;
//     const user = await User.findOne({
//       where: { appleUserId: decodedToken.sub || appleUserId },
//     });
//     if (!user) {
//       return next(new ErrorHandler("User not found", 404));
//     }
//     return res.status(200).json({
//       status: true,
//       user: {
//         id: user.id,
//         email: user.email,
//         name: user.name,
//         appleUserId: user.appleUserId,
//       },
//     });
//   } catch (error) {
//     return next(new ErrorHandler(error.message, 500));
//   }
// });

module.exports = {
  appleLogin,
  googleLogin
  // getUserByAppleUserId,
  // applePhone,
};
