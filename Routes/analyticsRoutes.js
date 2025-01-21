const express = require("express");
const router = express.Router();
const {
    createAnalytics,
    getCampaignAnalytics
} = require("../Controller/analyticsController");
const { verifyIp,verifyUserAgent } = require("../middleware/auth");

// Update routes to use upload middleware
router.post("/clickCount/create",verifyIp,verifyUserAgent,createAnalytics);
router.get("/getAll/:campaignID",verifyIp,verifyUserAgent,getCampaignAnalytics);



module.exports = router;
