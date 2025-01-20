const express = require("express");
const router = express.Router();
// const { verifyEndUser, authorize, verifySession } = require("../middleware/auth");
const {appleLogin}=require('../Controller/appleSigin')
const {googleLogin}=require('../Controller/googleSignin')
const {
  contactUs,
  updateInterestedProduct,
} = require("../Controller/contactUsController");
const {saveVisitorAndCampaign
} = require("../Controller/userController");
const { verifyEncryption } = require('../middleware/encryption');



router.post("/saveVisitorAndCampaign",verifyEncryption,saveVisitorAndCampaign)
router.post("/contactUs",contactUs)
router.post("/updateInterestedProduct",verifyEncryption,updateInterestedProduct)
// router.get("/getUserByToken",verifyEndUser,authorize(["USER"]),verifySession,getUserByToken)
// // router.delete('/deleteUser',verifyJWt,authorize(["USER"]),deleteUser)
// Apple Sign In routes
router.post('/appleSignin', verifyEncryption,appleLogin);
// router.get('/getUserByAppleUserId/:appleUserId',getUserByAppleUserId)
// router.post('/apple/phone',verifyEndUser,authorize(["USER"]),applePhone)

// Google Sign In routes
router.post('/googleSignin', verifyEncryption,googleLogin);
// router.post('/google/phone',verifyJWt,authorize(["USER"]),googlePhone)

module.exports = router;