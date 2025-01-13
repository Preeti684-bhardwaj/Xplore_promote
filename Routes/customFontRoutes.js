const express = require("express");
const router = express.Router();
const {
   uploadCustomFont,
   uploadUserCustomFont,
   getAllFonts,
   getAllUserFonts,
   getFontById 
} = require("../Controller/customFontController");
const { verifyJWt,verifySession,authorize } = require("../middleware/auth");
const upload = require("../middleware/multer");


router.post("/upload/:campaignID",verifyJWt,authorize(["USER"]),verifySession,upload.array('files'),uploadCustomFont)
router.post("/upload",verifyJWt,authorize(["USER"]),verifySession,upload.array('files'),uploadUserCustomFont)
router.get("/getAll",verifyJWt,authorize(["USER"]),verifySession,getAllUserFonts)
router.get("/getAll/:campaignID",getAllFonts)
router.get("/getOne/:id",getFontById)


module.exports = router;