const express = require("express");
const router = express.Router();
const {
    createLayout,
    getAllLayout,
    getOneLayout,
    getAllLayoutName,   
    updateLayout,
    deleteLayout,
    getAllLayoutByShortCode
} = require("../Controller/layoutController");
const { verifyJWt,verifySession,authorize } = require("../middleware/auth");


router.post("/create/:campaignID",verifyJWt,authorize(["USER"]),verifySession,createLayout)
router.get("/getAll/:campaignID",getAllLayout)
router.get("/getAllLayoutName/:campaignID",getAllLayoutName)
router.get("/getOne/:id",getOneLayout)
router.put("/update/:id",verifyJWt,authorize(["USER"]),verifySession,updateLayout)
router.delete("/delete/:id",verifyJWt,authorize(["USER"]),verifySession,deleteLayout)
router.get("/getLayout/:shortCode",getAllLayoutByShortCode);

module.exports = router;