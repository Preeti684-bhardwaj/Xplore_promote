const jwt = require("jsonwebtoken");
const db = require("../dbConfig/dbConfig.js");
const User = db.users;
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const sendEmail = require("../utils/sendEmail.js");
// const crypto = require("crypto");
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

// Generate OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper function to generate API key
// const generateApiKey = () => {
//   return crypto.randomBytes(32).toString("hex");
// };

// register user
const registerUser = async (req, res) => {
  const { name, phone, email, password } = req.body;
  try {
    // Validate input fields
    if ([name, phone, email, password].some((field) => field?.trim() === "")) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Please provide all necessary fields",
        });
    }
    // Validate input fields
    if (!name) {
      return res.status(400).send({
        success: false,
        message: "Name is missing",
      });
    }
    if (!phone) {
      return res.status(400).send({
        success: false,
        message: "Phone is missing",
      });
    }
    if (!email) {
      return res.status(400).send({
        success: false,
        message: "Email is missing",
      });
    }
    if (!password) {
      return res.status(400).send({
        success: false,
        message: "Password is missing",
      });
    }
    // Sanitize name: trim and reduce multiple spaces to a single space
    name.trim().replace(/\s+/g, " ");
    // Validate name
    const nameError = isValidLength(name);
    if (nameError) {
      return res.status(400).send({ success: false, message: nameError });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).send({ message: "Invalid email" });
    }

    // Convert the email to lowercase for case-insensitive comparison
    const lowercaseEmail = email.toLowerCase();

    // Check for existing user with the provided email or phone
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ email: lowercaseEmail }, { phone: phone }],
      },
    });

    if (existingUser) {
      if (existingUser.isEmailVerified) {
        // If the user is already verified, block the attempt to create a new account
        if (
          existingUser.email.toLowerCase() === lowercaseEmail &&
          existingUser.phone === phone
        ) {
          return res.status(409).send({ message: "Account already exists" });
        } else if (existingUser.email.toLowerCase() === lowercaseEmail) {
          return res.status(409).send({ message: "Email already in use" });
        } else {
          return res
            .status(400)
            .send({ message: "Phone number already in use" });
        }
      } else {
        // Update the existing user's record with the new email and generate a new verification token
        if (
          existingUser.email.toLowerCase() === lowercaseEmail &&
          existingUser.phone === phone
        ) {
          return res.status(409).send({ message: "Account already exists" });
        } else if (existingUser.email.toLowerCase() === lowercaseEmail) {
          return res.status(409).send({ message: "Email already in use" });
        } else {
          return res
            .status(409)
            .send({ message: "Phone number already in use" });
        }
      }
    }
    // If no existing user found, validate the password and create a new user
    const passwordValidationResult = isValidPassword(password);
    if (passwordValidationResult) {
      return res.status(400).send({
        success: false,
        message: passwordValidationResult,
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    // Create a new user if no existing user is found
    const user = await User.create({
      name,
      phone,
      email,
      password: hashedPassword,
      authProvider: "local",
    });

    const createdUser = await User.findByPk(user.id, {
      attributes: {
        exclude: ["password", "otp", "otpExpire", "isEmailVerified"],
      },
    });

    if (!createdUser) {
      return res
        .status(500)
        .json({
          success: false,
          message: "Something went wrong while registering the user",
        });
    }
    res.status(200).json({
      success: true,
      message: "user registered successfully",
      data: createdUser,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// signUp user
const signUp = async (req, res) => {
  const { email, otp } = req.body;

  // Validate the OTP
  if (!otp) {
    return res
      .status(400)
      .json({ success: false, message: "OTP is required." });
  }

  if (!email) {
    return res.status(400).send({ success: false, message: "Missing phone" });
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return res.status(400).send({ message: "Invalid email" });
  }

  // Convert the email to lowercase for case-insensitive comparison
  const lowercaseEmail = email.toLowerCase();

  try {
    const user = await User.findOne({
      where: { email: lowercaseEmail.trim() },
    });
    console.log(user);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found or invalid details.",
      });
    }

    // Check OTP validity
    if (user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
    if (user.otpExpire < Date.now()) {
      return res.status(400).json({ success: false, message: "expired OTP." });
    }

    // Update user details
    user.isEmailVerified = true;
    user.otp = null;
    user.otpExpire = null;
    await user.save();

    const obj = {
      type: "USER",
      obj: user,
    };
    const accessToken = generateToken(obj);

    res.status(201).json({
      success: true,
      message: "User data",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
      token: accessToken,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// login user
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .send({ success: false, message: "Please Enter Email & Password" });
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return res.status(400).send({ message: "Invalid email" });
  }

  // Convert the email to lowercase for case-insensitive comparison
  const lowercaseEmail = email.toLowerCase();
  try {
    const user = await User.findOne({
      where: { email: lowercaseEmail.trim() },
    });
    if (!user) {
      return res
        .status(404)
        .send({ success: false, message: "User does not exist" });
    }
    const isPasswordMatched = await bcrypt.compare(password, user.password);
    console.log("Password match result:", isPasswordMatched);

    if (!isPasswordMatched) {
      return res
        .status(400)
        .send({ success: false, message: "Invalid password" });
    }

    if (!user.isEmailVerified) {
      return res
        .status(403)
        .send({
          success: false,
          message: "Please verify your OTP before logging in",
        });
    }
    const obj = {
      type: "USER",
      obj: user,
    };
    const accessToken = generateToken(obj);

    const loggedInUser = await User.findByPk(user.id, {
      attributes: {
        exclude: ["password", "otp", "otpExpire", "isEmailVerified"],
      },
    });

    return res.status(200).json({
      success: true,
      message: "login successfully",
      data: loggedInUser,
      token: accessToken,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: error.message || "Some error occurred during signin.",
    });
  }
};

// send OTP
const sendOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send({ success: false, message: "Missing email" });
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return res.status(400).send({ message: "Invalid email" });
  }

  // Convert the email to lowercase for case-insensitive comparison
  const lowercaseEmail = email.toLowerCase();

  try {
    const user = await User.findOne({
      where: {
        email: lowercaseEmail.trim(),
      },
    });

    if (!user) {
      return res
        .status(400)
        .send({ success: false, message: "User not found" });
    }

    const otp = generateOtp();

    // Create HTML content for the email
    const htmlContent = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2>One-Time Password (OTP) for Verification</h2>
    <p>Hello,</p>
    <p>Your One Time Password (OTP) for Xplore Promote is:</p>
    <h1 style="font-size: 32px; background-color: #f0f0f0; padding: 10px; display: inline-block;">${otp}</h1>
    <p>This OTP is valid for 15 minutes.</p>
    <p>If you didn't request this OTP, please ignore this email.</p>
    <p>Best regards,<br>Xplore Promote Team</p>
  </div>
`;
    try {
      await sendEmail({
        email: user.email,
        subject: `Xplore Promote: Your One-Time Password (OTP) for Verification`,
        html: htmlContent,
      });

      user.otp = otp;
      user.otpExpire = Date.now() + 15 * 60 * 1000;

      await user.save({ validate: false });
      res.status(200).json({
        success: true,
        message: `OTP sent to ${user.email} successfully`,
        email: user.email,
      });
    } catch (emailError) {
      user.otp = null;
      user.otpExpire = null;
      await user.save({ validate: false });

      console.error("Failed to send OTP email:", emailError);
      return res.status(500).send({ status: false, error: error.message });
    }
  } catch (error) {
    return res.status(500).send({ status: false, error: error.message });
  }
};
// ---------------FORGET PASSWORD-----------------------------------------------------
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send({ message: "Missing email id" });
  }

  if (!isValidEmail(email)) {
    return res.status(400).send({ message: "Invalid email address" });
  }
  // Convert the email to lowercase for case-insensitive comparison
  const lowercaseEmail = email.toLowerCase();
  let user;

  try {
    user = await User.findOne({
      where: {
        email: lowercaseEmail.trim(),
      },
    });

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    if (!user.isEmailVerified) {
      return res.status(400).send({ message: "User is not verified" });
    }

    // Get ResetPassword Token
    const otp = generateOtp(); // Assuming you have a method to generate the OTP
    user.otp = otp;
    user.otpExpire = Date.now() + 15 * 60 * 1000; // Set OTP expiration time (e.g., 15 minutes)

    await user.save({ validate: false });

    // Create HTML content for the email
    // <img src="https://stream.xircular.io/AIengage.png" alt="AI Engage Logo" style="max-width: 200px; margin-bottom: 20px;">
    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Request</h2>
      <p>Hello,</p>
       <p>Your One Time Password (OTP) for Xplore Promote is:</p>
      <p>You have requested a password reset for your Xplore Promote account.</p>
        <p>Your One Time Password (OTP) for Xplore Promote is:</p>
      <h1 style="font-size: 32px; background-color: #f0f0f0; padding: 10px; display: inline-block;">${otp}</h1>
      <p>This OTP is valid for 15 minutes.</p>
      <p>If you didn't request this password reset, please ignore this email.</p>
      <p>Best regards,<br>Xplore Promote Team</p>
    </div>
    `;

    await sendEmail({
      email: user.email,
      subject: `Xplore Promote: Password Reset Request`,
      html: htmlContent,
    });

    user.otp = otp;
    user.otpExpire = Date.now() + 15 * 60 * 1000; // Set OTP expiration time (e.g., 15 minutes)

    await user.save({ validate: false });

    res.status(200).json({
      success: true,
      message: `Password reset otp sent to ${user.email}`,
      userId: user.id,
    });
  } catch (error) {
    user.otp = null;
    user.otpExpire = null;
    await user.save({ validate: false });

    return res.status(500).send({ status: false, error: error.message });
  }
};

// ---------------RESET PASSWORD------------------------------------------------------------
const resetPassword = async (req, res) => {
  const { password, otp } = req.body;
  const userId = req.params.userId;

  // Validate input fields
  if (!password || !otp) {
    return res
      .status(400)
      .send({
        status: false,
        message: "Missing required fields: password or OTP",
      });
  }
  const passwordValidationResult = isValidPassword(password);
  if (passwordValidationResult) {
    return res.status(400).send({
      success: false,
      message: passwordValidationResult,
    });
  }
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    // Find the user by ID
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).send({ status: false, message: "User not found" });
    }

    // Verify the OTP
    if (user.otp !== otp.trim()) {
      return res.status(400).send({ status: false, message: "Invalid OTP" });
    }
    if (user.otpExpire < Date.now()) {
      return res.status(400).send({ status: false, message: "Expired OTP" });
    }

    // Update the user's password and clear OTP fields
    user.password = hashedPassword;
    user.otp = null;
    user.otpExpire = null;

    await user.save({ validate: true });

    // Exclude password from the response
    const updatedUser = await User.findByPk(user.id, {
      attributes: {
        exclude: ["password"],
      },
    });

    return res.status(200).json({
      success: true,
      message: `Password updated for ${updatedUser.email}`,
    });
  } catch (error) {
    return res.status(500).send({ status: false, error: error.message });
  }
};

// getById
const getUserById = async (req, res) => {
  try {
    const id = req.params.id;
    const item = await User.findByPk(id, {
      attributes: { exclude: ["password"] },
    });
    if (!item) {
      return res.status(404).json({ success: false, error: "User not found" });
    } else {
      return res.json({ success: true, data: item });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// get user by token
const getUserByToken = async (req, res) => {
  try {
    const id = req.user.id;
    const user = await User.findByPk(id, {
      attributes: [
        "id",
        "name",
        "email",
        "phone",
        "isEmailVerified",
        "appleUserId",
        "googleUserId",
        "authProvider",
      ],
    });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    } else {
      return res.status(200).json({ success: true, data: user });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};


// get insta verify 
const getInsta= async (req, res) => {
  try {
    const userAgent = req.headers['user-agent'];
    console.log(userAgent);
  if (userAgent && userAgent.includes('Instagram')) {
    res.status(302).redirect('https://pre.xplore.xircular.io/'); // Redirect to your website
  } else {
    res.status(200).send('<a href="https://pre.xplore.xircular.io/">Click Here</a>'); // Show the link normally
  }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
// Update user
const updateUser = async (req, res) => {
  const { name } = req.body;

  // Validate input fields
  if ([name].some((field) => field?.trim() === "")) {
    return res
      .status(400)
      .send({ status: false, message: "Please provide all necessary field" });
  }

  const nameError = isValidLength(name);
  if (nameError) {
    return res.status(400).send({ success: false, message: nameError });
  }

  try {
    // Create a new user if no existing user is found
    const [num, [updatedUser]] = await User.update(
      { name },
      {
        where: {
          id: req.user.id,
        },
        returning: true,
      }
    );

    if (num === 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot update user with id=${req.user.id}. Maybe user was not found or req.body is empty!`,
      });
    }
    // Exclude sensitive fields from the updated user object
    const {
      id,
      name: updatedName,
      email,
      phone,
      createdAt,
      updatedAt,
    } = updatedUser;

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: {
        id,
        name: updatedName,
        email,
        phone,
        agreePolicy,
        createdAt,
        updatedAt,
      },
    });
  } catch (error) {
    return res.status(500).send({ success: false, error: error.message });
  }
};

// delete user
const deleteUser = async (req, res) => {
  const { phone } = req.query;
  try {
    const user = await User.findOne({ where: { phone: phone } });
    console.log(user);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found or invalid details.",
      });
    }
    await user.destroy();
    return res.status(200).send({
      success: true,
      message: `user with phone ${user.phone} deleted successfully`,
    });
  } catch (err) {
    return res.status(500).send({ status: false, message: err.message });
  }
};

module.exports = {
  registerUser,
  updateUser,
  signUp,
  loginUser,
  getUserById,
  getUserByToken,
  forgotPassword,
  resetPassword,
  sendOtp,
  deleteUser,
  getInsta
};
