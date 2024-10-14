const passport = require("passport");
const jwt = require("jsonwebtoken");
const db = require("../dbConfig/dbConfig.js");
const User = db.users;
const { OAuth2Client } = require('google-auth-library');

const {
  isValidEmail,
  isPhoneValid,
  isValidPassword,
  isValidLength,
} = require("../utils/validation.js");

const CLIENT_ID = process.env.CLIENT_ID;
const googleClient = new OAuth2Client({
  clientId: CLIENT_ID
});

async function verifyGoogleLogin(idToken) {
  try {
    const ticket = await googleClient.verifyIdToken({
      audience: CLIENT_ID,
      idToken: idToken
    });
    const payload = ticket.getPayload();
    console.log(payload);
    return payload;
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
    // Check if the Authorization header exists
    const idToken = req.headers["authorization"];
    console.log(idToken);
    // Check if idToken is provided
    if (!idToken || idToken === "null") {
        return res.status(401).send({ message: "No idToken provided." });
    }
    const response = await verifyGoogleLogin(idToken);
    if (!response) {
      return res.status(401).json({ status: false, error: "Failed to verify Google token" });
    }

    if (!response.sub) {
      return res.status(400).json({ status: false, error: "Invalid Google user ID" });
    }

    let user = await User.findOne({ where: { googleUserId: response.sub } });

    if (!user) {
      if (response.email && !isValidEmail(response.email)) {
        return res.status(400).json({ status: false, error: "Invalid email format" });
      }

      try {
        user = await User.create({
          email: response.email || null,
          name: response.name || null,
          isEmailVerified: response.email_verified || false,
          authProvider: "google",
          IsActive: true,
        });
      } catch (error) {
        console.error("Error creating user:", error);
        return res.status(500).json({ status: false, error: "Failed to create user" });
      }
    }

    if (!user.IsActive) {
      return res.status(403).json({ status: false, error: "User account is inactive" });
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
      },
      token: accessToken,
    });
  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({ status: false, error: "Internal server error" });
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