const express = require("express");
const router = express.Router();
const {
    createLayout,
    getAllLayout,
    getOneLayout,
    updateLayout,
    deleteLayout
} = require("../Controller/layoutController");
const { verifyJWt,verifySession } = require("../middleware/auth");


router.post("/create/:campaignID",verifyJWt,verifySession,createLayout)
router.get("/getAll/:campaignID",getAllLayout)
router.get("/getOne/:id",getOneLayout)
router.put("/update/:id",verifyJWt,verifySession,updateLayout)
router.delete("/delete/:id",verifyJWt,verifySession,deleteLayout)

module.exports = router;