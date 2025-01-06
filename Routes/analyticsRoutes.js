const express = require("express");
const router = express.Router();
const {
    createAnalytics,
    getCampaignAnalytics
} = require("../Controller/analyticsController");
const { verifyJWt,authorize, verifySession } = require("../middleware/auth");

// Update routes to use upload middleware
router.post("/clickCount/create",createAnalytics);
router.get("/getAll/:campaignID",getCampaignAnalytics);



module.exports = router;
