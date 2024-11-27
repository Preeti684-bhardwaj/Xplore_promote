const db = require("../dbConfig/dbConfig.js");
const User = db.users;
const { Op } = require("sequelize");
require("dotenv").config();
const {generateToken,createOrUpdateUser,validateAppleToken}=require('../validators/userValidation.js')
const {
  isPhoneValid,
} = require("../validators/validation.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

// ---------------apple signin---------------------------------
const appleLogin =asyncHandler(async (req, res,next) => {
  try {
    const authHeader = req.headers["authorization"];
    const idToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;
    const {email,name,appleUserId} = req.body;
    const decodedToken = validateAppleToken(idToken);
    console.log("decodedToken",decodedToken)
    const user = await createOrUpdateUser(email,name,appleUserId,decodedToken.sub, decodedToken);
console.log("appleUserId",decodedToken.sub);

    const obj = {
      type: 'USER',
      obj: user,
    };
    const accessToken = generateToken(obj);
    console.log("user after createorupdatefunction",user)

    // Audit log for successful login
    console.log(`Successful Apple login for user ID: ${user.appleUserId}`);

    return res.status(200).json({
      status: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        appleUserId: user.appleUserId,
      },
      token: accessToken,
    });
  } catch (error) {
    console.error('Apple login error:', error);
    return next(new ErrorHandler( error.message,500));
  }
});

//----------------Add phone number--------------------------------------------------
const applePhone = asyncHandler(async (req, res,next) => {
  try {
    const { phone } = req.body;
    const userId = req.user?.id;

    // Input validation
    if (!phone) {
      return next(new ErrorHandler('Missing phone number', 400));
    }

    if (!userId) {
       return next(new ErrorHandler('Invalid authentication token', 401));
    }

    const phoneError = isPhoneValid(phone);
    if (phoneError) {
      return next(new ErrorHandler(phoneError, 400));
    }

    // Find and validate user
    const user = await User.findOne({
      where: { id: userId },
    });

    if (!user) {
       return next(new ErrorHandler('User not found', 404));
    }

    if (!user.isEmailVerified) {
       return next(new ErrorHandler('Email not verified. Please verify your email first.', 403));
    }

    // Check for duplicate phone number across all users
    const existingPhoneUser = await User.findOne({
      where: {
        phone,
        id: { [Op.ne]: userId }, // Exclude current user
      },
    });

    if (existingPhoneUser) {
       return next(new ErrorHandler('Phone number already registered to another account', 409));
    }

    if (user.phone) {
       return next(new ErrorHandler('Phone number already exists for this user', 409));
    }

    // Update phone number with retry logic
    let retries = 3;
    while (retries > 0) {
      try {
        await user.update({ 
          phone
        });
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
      }
    }

    // Audit log for phone number update
    console.log(`Phone number updated for user ID: ${user.id}`);

    return res.status(200).json({
      status: true,
      message: 'Phone number added successfully',
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone
      },
    });
  } catch (error) {
    console.error('Phone update error:', error);
    return next(new ErrorHandler(error.message,500));
  }
});

// ---------------get user by appleUserId ---------------------------------
const getUserByAppleUserId = asyncHandler(async (req, res,next) => {
  try {
    const idToken = req.headers['authorization'];   
    const decodedToken = validateAppleToken(idToken);
    const {appleUserId} = req.params;
    const user = await User.findOne({where:{appleUserId: decodedToken.sub || appleUserId}})
    if(!user){
      return next(new ErrorHandler('User not found',404))
    }
    return res.status(200).json({status:true,user:{
      id:user.id,
      email:user.email,
      name:user.name,
      appleUserId:user.appleUserId
    }}) 
  } catch (error) {
    return next(new ErrorHandler(error.message,500))
  }
})

module.exports = {
  appleLogin,
  getUserByAppleUserId,
  applePhone,
};
