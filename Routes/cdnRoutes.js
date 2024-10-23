const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer"); // Add this line
const {
    uploadContent,
    deleteContent,
    getFiles,
    deleteContentCdn
} = require("../Controller/contentController");
const { verifyJWt } = require("../middleware/auth");


// Update routes to use upload middleware
router.post("/uploadContent", verifyJWt, upload.array('files'), uploadContent);
router.delete("/deleteContentCdn", deleteContentCdn);
router.delete("/deleteContent", verifyJWt ,deleteContent);
router.get("/files", getFiles);


module.exports = router;