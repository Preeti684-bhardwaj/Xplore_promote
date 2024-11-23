const express = require("express");
const router = express.Router();
const {
    saveVisitorAndCampaign,
    appleLogin,
    applePhone,
    contactUs,
    getUserByToken
} = require("../Controller/endUserController");
const { verifyEndUser, authorize, verifySession } = require("../middleware/auth");


router.post("/saveVisitorAndCampaign",saveVisitorAndCampaign)
router.post("/contactUs",contactUs)
router.get("/getUserByToken",verifyEndUser,authorize(["USER"]),verifySession,getUserByToken)
// router.delete('/deleteUser',verifyJWt,authorize(["USER"]),deleteUser)
// Apple Sign In routes
router.post('/appleSignin', appleLogin);
// router.get('/getUserByAppleUserId/:appleUserId',getUserByAppleUserId)
router.post('/apple/phone',verifyEndUser,authorize(["USER"]),applePhone)

// Google Sign In routes
// router.post('/googleSignin', googleLogin);
// router.post('/google/phone',verifyJWt,authorize(["USER"]),googlePhone)

module.exports = router;