const express = require("express");
const router = express.Router();
const {
    loginUser,
    signUp,
    registerUser,
    forgotPassword,
    resetPassword,
    sendOtp,
    getUserById,
    updateUser,
    deleteUser,
    handleSIWALogin
} = require("../Controller/userController");

const { verifyJWt } = require("../middleware/auth");


router.post("/register",registerUser)
router.post("/signUp", signUp)
router.post("/login",loginUser)
router.post("/password/forgot",forgotPassword)
router.post("/password/reset/:userId",resetPassword)
router.post("/sendOtp",sendOtp)
router.get("/getById/:id",getUserById)
router.put('/updateUser',verifyJWt,updateUser)
router.delete('/deleteUser',deleteUser)
// Apple Sign In routes
router.post('/tokensignin', handleSIWALogin);

module.exports = router;