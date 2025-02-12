const express = require("express");
const router = express.Router();
const {appleLogin}=require('../Controller/appleSigin')
const {googleLogin}=require('../Controller/googleSignin')
const {contactUs,updateInterestedProduct} = require("../Controller/contactUsController");
const {saveVisitorAndCampaign} = require("../Controller/userController");
// const { verifyEncryption } = require('../middleware/encryption');

router.post("/saveVisitorAndCampaign",saveVisitorAndCampaign);
router.post("/contactUs",contactUs);
router.post("/updateInterestedProduct",updateInterestedProduct);
// Apple Sign In routes
router.post('/appleSignin',appleLogin);
// Google Sign In routes
router.post('/googleSignin', googleLogin);
module.exports = router;