const express = require("express");
const router = express.Router();
const {
    userSignup,
    sendOtp,
    emailOtpVerification,
    userSignin,
    forgotPassword,
    resetPassword,
    appleSignIn,
    appleSignInCallback
} = require("../Controller/userController");

router.post("/signup", userSignup);
router.post("/signin", userSignin);
router.post("/sendOtp", sendOtp);
router.post("/emailVerification", emailOtpVerification);
router.post("/forgotpassword", forgotPassword);
router.post("/resetpassword/:token", resetPassword);

// Apple Sign In routes
router.get("/auth/apple", appleSignIn);
router.post("/auth/apple/callback", appleSignInCallback);

module.exports = router;