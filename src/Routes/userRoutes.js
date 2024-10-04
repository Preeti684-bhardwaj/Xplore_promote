const express = require("express");
const router = express.Router();
const { userSignup,
    sendOtp,
    emailOtpVerification,
    userSignin,
    forgotPassword,
    resetPassword } = require("../Controller/userController");
const {
  validateSignin
} = require("../utils/validation");

router.post("/signup",  userSignup);
router.post("/signin",  userSignin);
router.post("/sendOtp",sendOtp)
router.post("/emailVerification",emailOtpVerification)
router.post("/forgotpassword",forgotPassword);
router.post("/resetpassword/:token",resetPassword);
// router.get("/getUser/:userId",getUserById)
// router.get("/getUser", getUser);
// router.delete("/deleteuser",deleteUser);
// router.delete("/deleteAllUser",deleteAllUsers);


module.exports = router;