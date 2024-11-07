const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer"); // Add this line
const {
    createCampaign,
    getAllCampaign,
    getOneCampaign,
    updateCampaign,
    deleteCampaign
} = require("../Controller/campaignController");
const { verifyJWt, verifySession } = require("../middleware/auth");

// Update routes to use upload middleware
router.post("/create", verifyJWt, verifySession,upload.array('files'), createCampaign);
router.get("/getAll", verifyJWt,verifySession ,getAllCampaign);
router.get("/getOne/:id", verifyJWt,verifySession,getOneCampaign);
router.put("/update/:id", verifyJWt,verifySession, upload.array('files'), updateCampaign);
router.delete("/delete/:id", verifyJWt, verifySession,deleteCampaign);

module.exports = router;