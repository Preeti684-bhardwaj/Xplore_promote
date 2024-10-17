const passport = require("passport");
const jwt = require("jsonwebtoken");
const db = require("../dbConfig/dbConfig.js");
require("dotenv").config();
const {CLIENT_ID} = process.env
const User = db.users;
const { OAuth2Client } = require('google-auth-library');

const {
  isValidEmail,
  isPhoneValid,
  isValidPassword,
  isValidLength,
} = require("../utils/validation.js");

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

const generateToken = (user) => {
  return jwt.sign({ obj: user }, process.env.JWT_SECRET, {
    expiresIn: "72h",
  });
};

const googleLogin = async (req, res) => {
  try {
    // Get token from Authorization header and remove 'Bearer ' if present
    const authHeader = req.headers["authorization"];
    const idToken = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;

    if (!idToken || idToken === "null") {
      return res.status(401).json({ 
        status: false, 
        error: "No authentication token provided" 
      });
    }

    let googlePayload;
    try {
      googlePayload = await verifyGoogleLogin(idToken);
    } catch (error) {
      if (error.message.includes('Token used too late')) {
        return res.status(401).json({
          status: false,
          error: "Authentication token has expired. Please login again."
        });
      }
      return res.status(401).json({
        status: false,
        error: "Invalid authentication token"
      });
    }

    if (!googlePayload?.sub) {
      return res.status(400).json({ 
        status: false, 
        error: "Invalid Google account information" 
      });
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
        return res.status(400).json({ 
          status: false, 
          error: "Invalid email format from Google account" 
        });
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
          return res.status(409).json({ 
            status: false, 
            error: "Account already exists with this email" 
          });
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
      return res.status(403).json({ 
        status: false, 
        error: "This account has been deactivated" 
      });
    }

    const obj = {
      type: "USER",
      obj: user,
    };
    const accessToken = generateToken(obj);

    res.status(200).json({
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
    res.status(500).json({ 
      status: false, 
      error: "An error occurred during login. Please try again later." 
    });
  }
};

const googlePhone = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ status: false, error: "Missing phone number" });
    }

    const phoneError = isPhoneValid(phone);
    if (phoneError) {
      return res.status(400).json({ status: false, error: phoneError });
    }

    if (!req.decodedToken || !req.decodedToken.obj || !req.decodedToken.obj.obj || !req.decodedToken.obj.obj.id) {
      return res.status(401).json({ status: false, error: "Invalid or missing token" });
    }

    const userId = req.decodedToken.obj.obj.id;
    const user = await User.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ status: false, error: "User not found" });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({ status: false, error: "Email not verified. Please verify your email first." });
    }

    if (user.phone) {
      return res.status(409).json({ status: false, error: "Phone number already exists for this user" });
    }

    user.phone = phone;
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
    console.error("Error in googlePhone:", error);
    res.status(500).json({ status: false, error: "Internal server error" });
  }
};

module.exports = {
  googleLogin,
  googlePhone
};