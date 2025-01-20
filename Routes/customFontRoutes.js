const express = require("express");
const router = express.Router();
const {
   uploadCustomFont,
   uploadUserCustomFont,
   getAllFonts,
   getAllUserFonts,
   getFontById,
   downloadFontBySpecificName,
   fontUrlBySpecificName,
   deleteFontWeight
} = require("../Controller/customFontController");
const { verifyJWt,verifySession,authorize } = require("../middleware/auth");
const upload = require("../middleware/multer");
const { verifyEncryption} = require('../middleware/encryption');


router.post("/upload/:campaignID",verifyJWt,authorize(["USER"]),verifySession,upload.array('files'),uploadCustomFont)
router.post("/upload",verifyJWt,authorize(["USER"]),verifySession,upload.array('files'),uploadUserCustomFont)
router.get("/getAll",verifyJWt,authorize(["USER"]),verifySession,getAllUserFonts);
router.get("/getFontFile",downloadFontBySpecificName);
router.get("/getFontUrl",verifyEncryption,fontUrlBySpecificName);
router.get("/getAll/:campaignID",getAllFonts)
router.get("/getOne/:id",getFontById)
router.delete("/delete/fontWeight/:id",verifyJWt,authorize(["USER"]),verifySession,deleteFontWeight)

module.exports = router;