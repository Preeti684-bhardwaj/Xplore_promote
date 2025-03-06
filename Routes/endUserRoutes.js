const express = require("express");
const router = express.Router();
const {contactUs,updateInterestedProduct} = require("../Controller/contactUsController");
const{deletionData,facebookDataDeletion,sendWhatsAppOTP,otpVerification,initiateWhatsAppLogin,handleWhatsAppCallback}=require("../Controller/whatsappLogin")
const {saveVisitorAndCampaign,googleLogin,appleLogin,sendPhoneOtp,phoneVerification} = require("../Controller/endUserController");
// const { verifyEncryption } = require('../middleware/encryption');

router.post("/saveVisitorAndCampaign",saveVisitorAndCampaign);
router.post("/contactUs",contactUs);
router.post("/updateInterestedProduct",updateInterestedProduct);
// Apple Sign In routes
router.post('/auth/apple/signin',appleLogin);
// Google Sign In routes
router.post('/auth/google/signin', googleLogin);

// whatsapp login api
router.post("/auth/whatsapp/getLink",initiateWhatsAppLogin);
router.post("/auth/whatsapp/getOtp",sendWhatsAppOTP);
router.post("/auth/whatsapp/verifyOtp",otpVerification);
router.get("/auth/callback", handleWhatsAppCallback);
router.post("/meta/deletion", facebookDataDeletion ); // deleted Api
router.get("/meta/deletion/page",deletionData ); // deleted status Api

// local login apis
router.post("/auth/sms/getOtp", sendPhoneOtp);
router.post("/auth/sms/verifyOtp", phoneVerification);

module.exports = router;