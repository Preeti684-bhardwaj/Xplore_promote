const db = require("../dbConfig/dbConfig.js");
const Admin = db.admins;
const User = db.users;
const asyncHandler = require("../utils/asyncHandler.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const bcrypt = require("bcrypt");
const {
  generateToken,
  generateOtp,
  hashPassword,
} = require("../validators/userValidation.js");
const {
  isValidEmail,
  isValidPassword
} = require("../validators/validation.js");

// -------------------ADMIN SIGNUP------------------------------------------------------
const adminSignup = asyncHandler(async (req, res) => {
  try {
    const { email, password } = req.body;
    if ([email, password].some((field) => field?.trim() === "")) {
      return next(new ErrorHandler("All required fields must be filled", 400));
    }
    if (!email) {
      return next(new ErrorHandler("Email is missing", 400));
    }
    if (!password) {
      return next(new ErrorHandler("Password is missing", 400));
    }
    // Convert the email to lowercase for case-insensitive comparison
    const lowercaseEmail = email.toLowerCase().trim();
    // Validate email format
    if (!isValidEmail(lowercaseEmail)) {
      return next(new ErrorHandler("Invalid email", 400));
    }
    const existingAdmin = await Admin.findOne({
      where: { email: lowercaseEmail },
    });

    if (existingAdmin) {
        return next(new ErrorHandler("Email already in use", 409));
    }

    // Validate the password and create a new user
    const passwordValidationResult = isValidPassword(password);
    if (passwordValidationResult) {
      return next(new ErrorHandler(passwordValidationResult, 400));
    }

    const hashedPassword = await hashPassword(password);

    const admin = await Admin.create({
      email,
      password: hashedPassword
    });
    res.status(201).send({
      id: admin.id,
      email: admin.email
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// --------------------------ADMIN SIGNIN-----------------------------------------------------
const adminSignin = asyncHandler(async (req, res) => {
    try {
        const { email, password } = req.body;
    
        if (!email || !password || email.trim() === "" || password.trim() === "") {
          return next(new ErrorHandler("Email and Password are required", 400));
        }
    
        // Validate email format
        if (!isValidEmail(email)) {
          return next(new ErrorHandler("Invalid email", 400));
        }
    
        // Convert the email to lowercase for case-insensitive comparison
        const lowercaseEmail = email.toLowerCase().trim();
    const admin = await Admin.findOne({ where: { email :lowercaseEmail} });
    if (!admin) {
     return next(new ErrorHandler("admin not found.",400 ));
    }
    //if (!customer.IsActivated) {
    //    return res.status(401).json({ message: "Customer not found" });
    //}
    //if (!customer.IsEmailVerified) {
    //    return res.status(401).json({ message: "Email not verified" });
    //}

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      returnres
        .status(400)
        .send({ status: false, message: "Invalid password." });
    }

    const obj = {
      type: "ADMIN",
      obj: admin,
    };

    const token = generateToken(obj);

    res.status(200).send({
      status: true,
      id: admin.id,
      email: admin.email,
      token: token,
      // Add additional fields as necessary
    });
  } catch (error) {
    return res
      .status(500)
      .send({
        status: false,
        message: error.message || "Some error occurred during signin.",
      });
  }
});

// ------------------FORGET PASSWORD-------------------------------------------------------
// const forgotPassword = asyncHandler(async (req, res) => {
//   try {
//     const { email } = req.body;

//     if (!email) {
//       return res
//         .status(400)
//         .send({ status: false, message: "email is missing" });
//     }

//     const adminInfo = await Admin.findOne({
//       where: {
//         email: email.trim(),
//       },
//     });

//     if (!adminInfo) {
//       return res
//         .status(404)
//         .send({ status: false, message: "admin not found" });
//     }
//     return res.status(200).send({
//       success: true,
//       message: "valid email",
//       adminID: adminInfo.id,
//     });
//   } catch (error) {
//     return res
//       .status(500)
//       .send({ status: false, message: error.message || "An error occurred" });
//   }
// });

// // -----------------RESET PASSWORD-------------------------------------------------
// const resetPassword = asyncHandler(async (req, res) => {
//   try {
//     const { password } = req.body;
//     const adminId = req.params.adminId;

//     if (!password) {
//       return res
//         .status(400)
//         .send({ status: false, message: "Password is missing" });
//     }

//     const findAdmin = await Admin.findByPk(adminId);

//     if (!findAdmin) {
//       return res
//         .status(404)
//         .send({ status: false, message: "admin not found" });
//     }
//     const hashedPassword = await bcrypt.hash(password, 10);
//     findAdmin.password = hashedPassword;

//     await findAdmin.save({ validate: false });

//     const loggedInAdmin = await Admin.findByPk(findAdmin.id, {
//       attributes: {
//         exclude: ["password"],
//       },
//     });

//     return res.status(200).json({
//       success: true,
//       data: loggedInAdmin,
//     });
//   } catch (error) {
//     returnres
//       .status(500)
//       .send({ status: false, message: error.message || "An error occurred" });
//   }
// });
const updateBusinessUser=asyncHandler(async(req,res,next)=>{
try{
const {email}=req.body;
if(!email){
    return next(new ErrorHandler("Email is missing",400));
}
const lowercaseEmail = email.toLowerCase().trim();
const user=await User.findOne({where:{email:lowercaseEmail}});
if(!user){
    return next(new ErrorHandler("User not found",400));
}
    // Update the isBusinessUser field to true
    await user.update({ isBusinessUser: true });

    res.status(200).json({
        success: true,
        message: "User successfully updated to business user",
        user: {
            id: user.id,
            email: user.email,
            isBusinessUser: true
        }
    });

}catch(error){
    return next(new ErrorHandler(error.message,500));
}
})

module.exports = {
  adminSignup,
  adminSignin,
  updateBusinessUser,
//   forgotPassword,
//   resetPassword,
};
