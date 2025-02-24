const express = require("express");
const router = express.Router();
const {contactUs,updateInterestedProduct} = require("../Controller/contactUsController");
const{deletionData,facebookDataDeletion,sendWhatsAppOTP,otpVerification,initiateWhatsAppLogin,handleWhatsAppCallback}=require("../Controller/whatsappLogin")
const {saveVisitorAndCampaign,googleLogin,appleLogin} = require("../Controller/endUserController");
// const { verifyEncryption } = require('../middleware/encryption');

router.post("/saveVisitorAndCampaign",saveVisitorAndCampaign);
router.post("/contactUs",contactUs);
router.post("/updateInterestedProduct",updateInterestedProduct);
// Apple Sign In routes
router.post('/appleSignin',appleLogin);
// Google Sign In routes
router.post('/googleSignin', googleLogin);

// whatsapp login api
router.post("/auth/whatsapplink",initiateWhatsAppLogin);
router.post("/auth/whatsappOtp",sendWhatsAppOTP);
router.post("/auth/verifyOtp",otpVerification);
router.get("/auth/callback", handleWhatsAppCallback);
router.post("/meta/deletion", facebookDataDeletion ); // deleted Api
router.get("/meta/deletion/page",deletionData ); // deleted status Api
module.exports = router;