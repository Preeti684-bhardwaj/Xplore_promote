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
const { verifyJWt, authorize, verifySession } = require("../middleware/auth");


// Update routes to use upload middleware
router.post("/uploadContent", verifyJWtauthorize(["USER"]),verifySession, upload.array('files'), uploadContent);
router.get("/getAssets", verifyJWt,authorize(["USER"]),verifySession,getUploadedAssets);
router.delete("/deleteContentCdn", deleteContentCdn);
router.delete("/deleteContent", verifyJWt,authorize(["USER"]),verifySession,deleteContent);
router.get("/files", getFiles);


module.exports = router;