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
const { verifyJWt } = require("../middleware/auth");

// Update routes to use upload middleware
router.post("/create", verifyJWt, upload.array('files'), createCampaign);
router.get("/getAll", verifyJWt, getAllCampaign);
router.get("/getOne/:id", verifyJWt, getOneCampaign);
router.put("/update/:id", verifyJWt, upload.array('files'), updateCampaign);
router.delete("/delete/:id", verifyJWt, deleteCampaign);

module.exports = router;