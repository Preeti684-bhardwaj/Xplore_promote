const express = require("express");
const router = express.Router();
const {
    // appleSignIn,
    // appleSignInCallback,
    forgotPassword,
    resetPassword,
} = require("../Controller/userController");

// Apple Sign In routes
// router.get("/auth/apple", appleSignIn);
// router.post("/auth/apple/callback", appleSignInCallback);
router.post("/forgotpassword", forgotPassword);
router.post("/resetpassword/:token", resetPassword);


module.exports = router;