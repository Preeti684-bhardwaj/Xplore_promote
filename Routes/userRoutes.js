const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer");
const {
    registerUser,
    phoneVerification,
    sendPhoneOtp,
    sendOtp,
    emailVerification,
    loginUser,
    forgotPassword,
    resetPassword,
    getUserById,
    updateUser,
    deleteUser,           
    getUserDetails,
    getUserByToken,
    getInsta,
    logout,
    logoutAll,
    getEndUserDetails
} = require("../Controller/userController");
const {appleLogin,getUserByAppleUserId,applePhone}=require('../Controller/appleSigin')
const {googleLogin,googlePhone}=require('../Controller/googleSignin')
const { verifyJWt, authorize, verifySession } = require("../middleware/auth");


router.post("/register",registerUser)
router.post("/sendOtp",sendOtp)
router.post("/signUp", emailVerification)
router.post("/login",loginUser)
router.post("/password/forgot",forgotPassword)
router.post("/password/reset/:userId",resetPassword)
router.get("/getById/:id",getUserById)
router.post("/sendPhoneOtp",sendPhoneOtp)
router.post("/phoneVerification", phoneVerification)
router.get("/getUserDetails",verifyJWt,authorize(["USER"]),verifySession,getUserDetails)
router.get("/getUserByToken",verifyJWt,authorize(["USER"]),verifySession,getUserByToken)
// get end user details
router.get("/getEndUserDetails/:campaignID",verifyJWt,authorize(["USER"]),verifySession,getEndUserDetails)
router.put('/updateUser', 
    verifyJWt,authorize(["USER"]), 
    upload.fields([
      { name: 'userImages', maxCount: 5 },
      { name: 'companyImages', maxCount: 5 }
    ]), 
    updateUser
  );
router.delete('/deleteUser',verifyJWt,authorize(["USER"]),deleteUser)
// logout user from web
router.delete('/logout',verifyJWt,authorize(["USER"]),logout)
router.delete('/logoutAll',verifyJWt,authorize(["USER"]),logoutAll)

// redirection from insta
router.get("/redirect",getInsta)
// Apple Sign In routes
router.post('/appleSignin', appleLogin);
router.get('/getUserByAppleUserId/:appleUserId',getUserByAppleUserId)
router.post('/apple/phone',verifyJWt,authorize(["USER"]),applePhone)

// Google Sign In routes
router.post('/googleSignin', googleLogin);
router.post('/google/phone',verifyJWt,authorize(["USER"]),googlePhone)

module.exports = router;