const express = require("express");
const router = express.Router();
const {
    createAdvertisement,
    getAllAdvertisement,
    getOneAdvertisement,
    updateAdvertisement,
    deleteAdvertisement
} = require("../Controller/advertisementController");
const { verifyJWt } = require("../middleware/auth");


router.post("/create/:campaignId",verifyJWt,createAdvertisement)
router.get("/getAll",getAllAdvertisement)
router.get("/getOne/:id",getOneAdvertisement)
router.put("/update/:id",verifyJWt,updateAdvertisement)
router.delete("/delete/:id",verifyJWt,deleteAdvertisement)

module.exports = router;