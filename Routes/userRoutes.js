const express = require("express");
const router = express.Router();
const {
    registerUser,
    sendOtp,
    signUp,
    loginUser,
    forgotPassword,
    resetPassword,
    getUserById,
    updateUser,
    deleteUser,
    getUserByToken
} = require("../Controller/userController");
const {appleLogin,applePhone}=require('../Controller/appleSigin')
const {googleLogin,googlePhone}=require('../Controller/googleSignin')
const { verifyJWt } = require("../middleware/auth");


router.post("/register",registerUser)
router.post("/sendOtp",sendOtp)
router.post("/signUp", signUp)
router.post("/login",loginUser)
router.post("/password/forgot",forgotPassword)
router.post("/password/reset/:userId",resetPassword)
router.get("/getById/:id",getUserById)
router.get("/getUserByToken",verifyJWt,getUserByToken)
router.put('/updateUser',verifyJWt,updateUser)
router.delete('/deleteUser',deleteUser)
// Apple Sign In routes
router.post('/appleSignin', appleLogin);
router.post('/apple/phone',verifyJWt,applePhone)

// Google Sign In routes
router.post('/googleSignin', googleLogin);
router.post('/google/phone',verifyJWt,googlePhone)

module.exports = router;