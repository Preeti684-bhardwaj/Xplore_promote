const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer"); // Add this line
const {
    uploadContent,
    deleteContent,
    getFiles,
    deleteContentCdn,
    getUploadedAssets
} = require("../Controller/contentController");
const { verifyJWt, verifySession } = require("../middleware/auth");


// Update routes to use upload middleware
router.post("/uploadContent", verifyJWt,verifySession, upload.array('files'), uploadContent);
router.get("/getAssets", verifyJWt,verifySession,getUploadedAssets);
router.delete("/deleteContentCdn", deleteContentCdn);
router.delete("/deleteContent", verifyJWt,verifySession,deleteContent);
router.get("/files", getFiles);


module.exports = router;