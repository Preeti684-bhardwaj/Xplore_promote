const db = require("../dbConfig/dbConfig.js");
const User = db.users;
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const sendEmail = require("../utils/sendEmail.js");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const {
  isValidEmail,
  isValidPassword,
  isValidLength,
} = require("../utils/validation.js");

// Helper function to generate JWT
const generateToken = (user) => {
  return jwt.sign({ obj: user }, process.env.JWT_SECRET, {
    expiresIn: "72h", // expires in 24 hours
  });
};

// OTP validity period in seconds (e.g., 15 minutes)
const OTP_VALIDITY = 15 * 60;

// Generate OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper function to generate API key
// const generateApiKey = () => {
//   return crypto.randomBytes(32).toString("hex");
// };

// -----------------USER SIGNUP-----------------------------------------------------
const userSignup = async (req, res) => {
  try {
    const { name: rawName, phone, email, password } = req.body;

    // Validate input fields
    if (!rawName) {
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
    const name = rawName.trim().replace(/\s+/g, " ");

    // Validate input fields again to check if they are empty strings
    if ([name, phone, email, password].some((field) => field === "")) {
      return res.status(400).send({
        success: false,
        message: "Please provide all necessary fields",
      });
    }

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
          return res.status(400).send({ message: "Account already exists" });
        } else if (existingUser.email.toLowerCase() === lowercaseEmail) {
          return res.status(400).send({ message: "Email already in use" });
        } else {
          return res
            .status(400)
            .send({ message: "Phone number already in use" });
        }
      }
      //  else {
      //   // Update the existing user's record with the new email and generate a new verification token
      //   existingUser.email = lowercaseEmail;
      //   existingUser.emailToken = generateToken({ email: lowercaseEmail });
      //   await existingUser.save();
      // }
    }

    // If no existing user found, validate the password and create a new user
    const passwordValidationResult = isValidPassword(password);
    if (passwordValidationResult) {
      return res.status(400).send({
        success: false,
        message: passwordValidationResult,
      });
    }
    // const hashedPassword = await bcrypt.hash(password, 10);
    // Generate a verification token
    // const emailToken = generateToken({ email: lowercaseEmail });

    // Temporarily store minimal data in the User table
    // const user = await User.create({
    //   email: lowercaseEmail,
    //   emailToken,
    //   isEmailVerified: false, // Set verified status to false
    // });

    res.status(201).send({
      success: true,
      message: "Signup successful. Please verify your email.",
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: error.message || "Some error occurred during signup.",
    });
  }
};

// ----------------Send OTP-----------------------------

const sendOtp = async (req, res) => {
  const { email } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).send({ message: "Invalid or missing email" });
  }

  const otp = generateOtp();
  const expirationTime = Date.now() + OTP_VALIDITY * 1000;

  // Create a token with the email, OTP, and expiration time
  const token = jwt.sign(
    {
      email,
      otp,
      expirationTime,
    },
    process.env.JWT_SECRET,
    { expiresIn: `${OTP_VALIDITY}s` }
  );

  // Create HTML content for the email
  //   <img src="https://stream.xircular.io/AIengage.png" alt="AI Engage Logo" style="max-width: 200px; margin-bottom: 20px;">
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
      email: email,
      subject: `Xplore Promote: Your One-Time Password (OTP) for Verification`,
      html: htmlContent,
    });

    res.status(200).json({
      success: true,
      message: `OTP sent to ${email} successfully`,
      token: token,
    });
  } catch (emailError) {
    console.error("Failed to send OTP email:", emailError);
    return res.status(500).send(emailError.message);
  }
};

// ---------------------Email OTP Verification------------------------------

const emailOtpVerification = async (req, res) => {
  const { Otp, name, phone, password } = req.body;
  const token = req.headers["token"];
  if (!token) {
    return res
      .status(400)
      .json({ success: false, message: "Token is required." });
  }
  if (!Otp) {
    return res
      .status(400)
      .json({ success: false, message: "OTP is required." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { email, otp, expirationTime } = decoded;

    // Check if OTP has expired
    if (Date.now() > expirationTime) {
      return res
        .status(400)
        .json({ success: false, message: "OTP has expired." });
    }

    // Verify OTP
    if (Otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP." });
    }

    // OTP is valid, proceed with user verification or registration
    const lowercaseEmail = email.toLowerCase();

    // Check if user already exists
    let user = await User.findOne({ where: { email: lowercaseEmail } });

    if (user) {
      // Update existing user
      user.isEmailVerified = true;
      await user.save();
    } else {
      // Create new user
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await User.create({
        name: name.trim().replace(/\s+/g, " "),
        phone: phone,
        email: lowercaseEmail,
        password: hashedPassword,
        isEmailVerified: true,
      });
    }

    res.status(200).json({
      success: true,
      message: "Email verified and user details saved successfully.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};
// -----------------USER SIGNIN-----------------------------------------------------
const userSignin = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email) {
      return res
        .status(400)
        .send({ success: false, message: "email is missing" });
    }

    if (!password) {
      return res
        .status(400)
        .send({ success: false, message: "password is missing" });
    }
    const user = await User.findOne({ where: { email } });
    console.log("User Found:", user); // Debugging log
    if (!user) {
      return res
        .status(404)
        .send({ success: false, message: "User not found." });
    }
    //if (!user.IsActivated) {
    //    return res.status(401).json({ message: "User not found" });
    //}
    if (!user.isEmailVerified) {
      return res.status(401).json({ message: "Email not verified" });
    }
    console.log("password coming", password);
    console.log("logging stored hashed password", user.password);
    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log("Password Valid:", isPasswordValid); // Debugging log

    if (!isPasswordValid) {
      return res
        .status(400)
        .send({ success: false, message: "Invalid password." });
    }

    const obj = {
      type: "USER",
      obj: user,
    };
    // let apiKey = user.api_key;
    // if (!apiKey) {
    //   // Generate API key
    //   apiKey = generateApiKey();
    //   // Update the user record with the new API key
    //   await user.update({ api_key: apiKey });
    // }
    // const options = {
    //   expires: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    //   httpOnly: false,
    //   secure: true,
    //   sameSite: "none",
    //   path: "/",
    // };
    //  generate token
    const token = generateToken(obj);
    // res.cookie("access_token", token, options);
    // console.log("i am from signin", req.cookies);
    res.status(200).json({
      success: true,
      message: "login successfully",
      id: user.id,
      email: user.email,
      token: token,
      //   api_key: apiKey,
      // Add additional fields as necessary
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: error.message || "Some error occurred during signin.",
    });
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

  let user;

  try {
    user = await User.findOne({
      where: {
        email: email.trim(),
      },
    });

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    if (!user.isEmailVerified) {
      return res.status(400).send({ message: "User is not verified" });
    }

    // Get ResetPassword Token
    const otp = user.generateOtp(); // Assuming you have a method to generate the OTP
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
      html: htmlContent
    });

    res.status(200).json({
      success: true,
      message: `Password reset otp sent to ${user.email}`,
    });
  } catch (error) {
    user.otp = null;
    user.otpExpire = null;
    await user.save({ validate: false });

    return res.status(500).send(error.message);
  }
};

// ---------------RESET PASSWORD------------------------------------------------------------
const resetPassword = async (req, res) => {
    const { password, otp } = req.body;
    const userId = req.params.userId;

  // Validate input fields
  if ([ password, otp].some((field) => field?.trim() === "")) {
    return res.status(400).send({
      success: false,
      message: "Please provide necessary field",
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
    // Find the user by reset token
    const user = await User.findByPk(userId);
    if (!user) {
         return res.status(400).send({ message:"User not found"});
      }
  
      // Verify the OTP
      if (user.otp !== otp.trim()) {
        return res.status(400).send({ message:"Invalid OTP"});
      }
      if (user.otpExpire < Date.now()) {
        return res.status(400).send({ message:"Expired OTP"});
      }
  
      // Update the user's password and clear OTP fields
      user.password = password;
      user.otp = null;
      user.otpExpire = null;
  
      await user.save({ validate: true });

    if (!user) {
      return res.status(400).send({ message: "Invalid or expired token" });
    }

    // Update the user's password and clear token fields
    user.password = hashedPassword;
    user.resetToken = null;
    user.resetTokenExpire = null;

    await user.save({ validate: true });

    // Exclude password from the response
    const updatedUser = await user.findByPk(user.id, {
      attributes: {
        exclude: ["password"],
      },
    });

    return res.status(200).json({
      success: true,
      message: `Password updated for ${updatedUser.email}`,
    });
  } catch (error) {
    return res.status(500).send(error.message);
  }
};

// ===================get user by id------------------------------------

// const getUserById = asyncHandler(async (req, res, next) => {
//   try {
//     const id = req.params.userId;
//     const item = await Customer.findByPk(id, {
//       attributes: { exclude: ["password"] },
//     });
//     if (!item) {
//       res.status(404).json({ success: false, error: "User not found" });
//     } else {
//       res.json({ success: true, data: item });
//     }
//   } catch (error) {
//     return res.status(500).send(error.message);
//   }
// });

// delete user through phone
// const deleteUser = asyncHandler(async (req, res, next) => {
//   const { phone } = req.body;
//   try {
//     const user = await Customer.findOne({ where: { phone: phone } });
//     console.log(user);
//     if (!user) {
//       return res.status(400).json({
//         success: false,
//         message: "User not found or invalid details.",
//       });
//     }
//     await user.destroy();
//     res.status(200).send({
//       success: true,
//       message: `user with phone ${user.phone} deleted successfully`,
//     });
//   } catch (err) {
//     return res.status(500).send({
//       success: false,
//       message: err.message,
//     });
//   }
// });

// delete all user
// const deleteAllUsers = async (req, res) => {
//   try {
//     await Customer.destroy({
//       where: {}, // Empty condition means all records
//     });

//     res
//       .status(200)
//       .json({ message: "All users have been deleted successfully." });
//   } catch (error) {
//     console.error("Error deleting users:", error);
//     res
//       .status(500)
//       .json({ message: "An error occurred while deleting users." });
//   }
// };

// get All user
// const getUser = asyncHandler(async (req, res, next) => {
//   try {
//     const item = await Customer.findAll({
//       attributes: { exclude: ["password"] },
//     });
//     if (!item) {
//       res.status(404).json({ success: false, error: "User not found" });
//     } else {
//       res.json({ success: true, data: item });
//     }
//   } catch (error) {
//     return res.status(500).send({
//       success: false,
//       message: err.message,
//     });
//   }
// });

module.exports = {
  userSignup,
  sendOtp,
  emailOtpVerification,
  userSignin,
  forgotPassword,
  resetPassword
//   getUserById,
//   freeTrial,
//   deleteAllUsers,
  // logOut,
//   deleteUser,
//   getUser,
};
