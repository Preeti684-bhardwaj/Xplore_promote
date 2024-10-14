const passport = require("passport");
const AppleStrategy = require("passport-apple");
const jwt = require("jsonwebtoken");
const db = require("../dbConfig/dbConfig.js");
const User = db.users;
const axios = require("axios");
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const sendEmail = require("../utils/sendEmail.js");

const {
  isValidEmail,
  isPhoneValid,
  isValidPassword,
  isValidLength,
} = require("../utils/validation.js");

// Helper function to generate JWT
const generateToken = (user) => {
  return jwt.sign({ obj: user }, process.env.JWT_SECRET, {
    expiresIn: "72h", // expires in 24 hours
  });
};

// ---------------apple signin---------------------------------
const appleLogin = async (req, res) => {
    try {
        // Check if the Authorization header exists
        const idToken = req.headers["authorization"];
        console.log(idToken);
        // Check if idToken is provided
        if (!idToken || idToken === "null") {
            return res.status(401).send({ message: "No idToken provided." });
        }
    let decodedToken;
    try {
      decodedToken = jwt.decode(idToken);
    } catch (error) {
      console.error("Error decoding token:", error);
      return res
        .status(400)
        .json({ status: false, error: "Invalid identity token" });
    }

    // Check if token was successfully decoded
    if (!decodedToken || !decodedToken.sub) {
      return res
        .status(400)
        .json({ status: false, error: "Invalid token payload" });
    }

    const appleUserId = decodedToken.sub;

    let user = await User.findOne({ where: { appleUserId: appleUserId } });

    if (!user) {
      // Validate email if provided
      if (decodedToken.email && !isValidEmail(decodedToken.email)) {
        return res
          .status(400)
          .json({ status: false, error: "Invalid email format" });
      }

      // Create a new user if not found
      try {
        user = await User.create({
          appleUserId: appleUserId,
          email: decodedToken.email || null,
          name: decodedToken.name
            ? `${decodedToken.name.firstName} ${decodedToken.name.lastName}`
            : null,
          isEmailVerified: true, // Apple has verified the email
          authProvider: "apple",
          IsActive: true,
        });
      } catch (error) {
        console.error("Error creating user:", error);
        return res
          .status(500)
          .json({ status: false, error: "Failed to create user" });
      }
    }

    // Check if the user is active
    if (!user.IsActive) {
      return res
        .status(403)
        .json({ status: false, error: "User account is inactive" });
    }

    //  generate a JWT token for the user session
    const obj = {
      type: "USER",
      obj: user,
    };
    const accessToken = generateToken(obj);

    res.status(200).json({
      status: true,
      message: "login successfully",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token: accessToken,
    });
  } catch (error) {
    console.error("Apple login error:", error);
    res.status(500).json({ status: false, error: "Internal server error" });
  }
};

const applePhone = async (req, res) => {
  try {
    const { phone } = req.body;

    // Check if phone number is provided
    if (!phone) {
      return res
        .status(400)
        .json({ status: false, error: "Missing phone number" });
    }

    // Validate phone number
    const phoneError = isPhoneValid(phone);
    if (phoneError) {
      return res.status(400).send({ success: false, message: phoneError });
    }
    const userId=req.decodedToken.obj.obj.id;
    console.log(req.userId);
    // Find the user based on the ID from the auth token
    const user = await User.findOne({
      where: { id: userId },
    });

    // Check if user exists
    if (!user) {
      return res.status(404).json({ status: false, error: "User not found" });
    }

    // Check if user's email is verified
    if (!user.isEmailVerified) {
      return res
        .status(403)
        .json({
          status: false,
          error: "Email not verified. Please verify your email first.",
        });
    }

    // Check if user already has a phone number
    if (user.phone) {
      return res
        .status(409)
        .json({
          status: false,
          error: "Phone number already exists for this user",
        });
    }

    // Update user's phone number
    user.phone = phone;

    // Save the updated user
    await user.save();

    res.status(200).json({
      status: true,
      message: "Phone number added successfully",
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("Error in applePhone:", error);
    res.status(500).json({ status: false, error: error.message });
  }
};

module.exports = {
  appleLogin,
  applePhone,
};
