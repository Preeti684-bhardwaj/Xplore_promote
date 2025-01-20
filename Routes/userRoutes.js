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
  // getUserDetails,
  getUserByToken,
  getInsta,
  logout,
  logoutAll,
  getUserProfile,
  saveVisitorAndCampaign,
  getUserShortUrl
} = require("../Controller/userController");
const { appleLogin, googleLogin } = require("../Controller/MainUserController");
// const {googleLogin}=require('../Controller/googleSignin')
const { verifyJWt, authorize, verifySession } = require("../middleware/auth");
const { verifyEncryption} = require('../middleware/encryption');
const { getContactDetails } = require("../Controller/contactUsController");
const{deletionData,facebookDataDeletion,  initiateWhatsAppLogin,handleWhatsAppCallback}=require("../Controller/whatsappLogin")


// whatsapp login api
router.post("/auth/whatsApp",initiateWhatsAppLogin);
router.post("/whatsApp/callback", handleWhatsAppCallback);
router.post("/meta/deletion", facebookDataDeletion ); // deleted Api
router.get("/meta/deletion/page",deletionData ); // deleted status Api

// registration main app api
router.post("/register", registerUser);
router.post("/sendOtp", sendOtp);
router.post("/signUp", emailVerification);
router.post("/login", loginUser);
router.post("/password/forgot", forgotPassword);
router.post("/password/reset/:userId", resetPassword);
router.get("/getById/:id", getUserById);
router.post("/sendPhoneOtp", sendPhoneOtp);
router.post("/phoneVerification", phoneVerification);
// router.get("/getUserDetails",verifyJWt,authorize(["USER"]),verifySession,getUserDetails)
router.get(
  "/getUserByToken",
  verifyJWt,
  authorize(["USER"]),
  verifySession,
  getUserByToken
);
// get user profile layout
router.get("/getUserProfile/:id",verifyEncryption, getUserProfile);
router.put(
  "/updateUser",
  verifyJWt,
  authorize(["USER"]),
  upload.fields([
    { name: "userImages", maxCount: 5 },
    { name: "companyImages", maxCount: 5 },
  ]),
  updateUser
);
router.delete("/deleteUser", verifyJWt, authorize(["USER"]), deleteUser);
// logout user from web
router.delete("/logout", verifyJWt, authorize(["USER"]), logout);
router.delete("/logoutAll", verifyJWt, authorize(["USER"]), logoutAll);
// redirection from insta
router.get("/redirect", getInsta);
// Apple Sign In routes
router.post("/appleSignin", appleLogin);
// router.get('/getUserByAppleUserId/:appleUserId',getUserByAppleUserId)
// router.post('/apple/phone',verifyJWt,authorize(["USER"]),applePhone)

// Google Sign In routes
router.post("/googleSignin", googleLogin);
// router.post('/google/phone',verifyJWt,authorize(["USER"]),googlePhone)

// save visitor Id
router.post("/saveVisitorAndCampaign", saveVisitorAndCampaign);
router.get("/getSubmittedContact/:campaignID", verifyJWt,authorize(["USER"]),verifySession, getContactDetails);
router.get("/profileLayout/:shortCode",getUserShortUrl)
module.exports = router;
