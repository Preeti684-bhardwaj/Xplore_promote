const express = require("express");
const router = express.Router();
const {
    // appleSignIn,
    handleSIWALogin,
    forgotPassword,
    resetPassword,
} = require("../Controller/userController");

// Apple Sign In routes
router.post('/tokensignin', handleSIWALogin);
router.post("/forgotpassword", forgotPassword);
router.post("/resetpassword/:token", resetPassword);


module.exports = router;