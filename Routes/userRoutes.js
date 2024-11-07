const express = require("express");
const router = express.Router();
const {
    registerUser,
    sendOtp,
    emailVerification,
    loginUser,
    forgotPassword,
    resetPassword,
    getUserById,
    updateUser,
    deleteUser,
    getUserByToken,
    getInsta,
    logout,
    logoutAll
} = require("../Controller/userController");
const {appleLogin,applePhone}=require('../Controller/appleSigin')
const {googleLogin,googlePhone}=require('../Controller/googleSignin')
const { verifyJWt, verifySession } = require("../middleware/auth");


router.post("/register",registerUser)
router.post("/sendOtp",sendOtp)
router.post("/signUp", emailVerification)
router.post("/login",loginUser)
router.post("/password/forgot",forgotPassword)
router.post("/password/reset/:userId",resetPassword)
router.get("/getById/:id",getUserById)
router.get("/getUserByToken",verifyJWt,verifySession,getUserByToken)
router.put('/updateUser',verifyJWt,updateUser)
router.delete('/deleteUser',verifyJWt,deleteUser)
// logout user from web
router.delete('/logout',verifyJWt,logout)
router.delete('/logoutAll',verifyJWt,logoutAll)

// redirection from insta
router.get("/redirect",getInsta)
// Apple Sign In routes
router.post('/appleSignin', appleLogin);
router.post('/apple/phone',verifyJWt,applePhone)

// Google Sign In routes
router.post('/googleSignin', googleLogin);
router.post('/google/phone',verifyJWt,googlePhone)

module.exports = router;