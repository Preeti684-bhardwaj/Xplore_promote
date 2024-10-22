const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer"); // Add this line
const {
    uploadContent,
    deleteContent,
    getFiles
} = require("../Controller/contentController");
const { verifyJWt } = require("../middleware/auth");


// Update routes to use upload middleware
router.post("/uploadContent", verifyJWt, upload.array('files'), uploadContent);
// router.delete("/deleteContent/:assetStoreId", verifyJWt, deleteContent);
router.delete("/deleteContent", verifyJWt ,deleteContent);
router.get("/files", getFiles);


module.exports = router;