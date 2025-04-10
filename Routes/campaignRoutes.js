const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer"); 
const {
    createCampaign,
    getAllCampaign,
    getOneCampaign,
    updateCampaign,
    deleteCampaign,
    getAllCampaignMetadata,
    shareCampaign,
    removeSharedAccess,
    getSharedUsers
} = require("../Controller/campaignController");
const { verifyJWt,authorize, verifySession } = require("../middleware/auth");

// Update routes to use upload middleware
router.post("/create", verifyJWt, authorize(["USER"]), verifySession,upload.array('files'), createCampaign);
router.get("/getAll", verifyJWt,authorize(["USER"]),verifySession ,getAllCampaign);
router.get("/getOne/:id", verifyJWt,authorize(["USER"]),verifySession,getOneCampaign);
router.put("/update/:id", verifyJWt,authorize(["USER"]),verifySession, upload.array('files'), updateCampaign);
router.delete("/delete/:id", verifyJWt, authorize(["USER"]), verifySession,deleteCampaign);
router.get('/getAllCampaignMetadata',getAllCampaignMetadata)

// New sharing routes
router.post("/share", verifyJWt, authorize(["USER"]), verifySession, shareCampaign);
router.post("/removeAccess", verifyJWt, authorize(["USER"]), verifySession, removeSharedAccess);
router.get("/sharedUsers/:campaignId", verifyJWt, authorize(["USER"]), verifySession, getSharedUsers);


module.exports = router;
