const express = require("express");
const router = express.Router();
const {
  uploadProductImages,
  getProductImagesByCampaign,
  getProductImageById,
  updateProductImages
} = require("../Controller/productImagesController");
const { verifyJWt, verifySession, authorize } = require("../middleware/auth");
const upload = require("../middleware/multer");

router.post(
  "/create/:campaignID",
  verifyJWt,
  authorize(["USER"]),
  verifySession,
  uploadProductImages
);
router.get("/getAll/:campaignID", getProductImagesByCampaign);
router.get("/getOne/:id", getProductImageById);
router.put("/update/:id",verifyJWt,
   authorize(["USER"]),
   verifySession,updateProductImages)

module.exports = router;
