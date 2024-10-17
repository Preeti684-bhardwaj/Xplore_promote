const express = require("express");
const router = express.Router();
const {
    createCampaign,
    getAllCampaign,
    getOneCampaign,
    updateCampaign,
    deleteCampaign
} = require("../Controller/campaignController");
const { verifyJWt } = require("../middleware/auth");


router.post("/create",verifyJWt,createCampaign)
router.get("/getAll",getAllCampaign)
router.get("/getOne/:id",getOneCampaign)
router.put("/update/:id",verifyJWt,updateCampaign)
router.delete("/delete/:id",verifyJWt,deleteCampaign)

module.exports = router;