const express = require("express");
const router = express.Router();
const {
   uploadCustomFont,
   getAllFonts,
   getFontById 
} = require("../Controller/customFontController");
const { verifyJWt,verifySession,authorize } = require("../middleware/auth");
const upload = require("../middleware/multer");


router.post("/upload/:campaignID",verifyJWt,authorize(["USER"]),verifySession,upload.array('files'),uploadCustomFont)
router.get("/getAll/:campaignID",getAllFonts)
router.get("/getOne/:id",getFontById)


module.exports = router;