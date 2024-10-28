const express = require("express");
const router = express.Router();
const {
    createLayout,
    getAllLayout,
    getOneLayout,
    updateLayout,
    deleteLayout
} = require("../Controller/layoutController");
const { verifyJWt } = require("../middleware/auth");


router.post("/create/:campaignID",verifyJWt,createLayout)
router.get("/getAll/:id",getAllLayout)
router.get("/getOne/:id",getOneLayout)
router.put("/update/:id",verifyJWt,updateLayout)
router.delete("/delete/:id",verifyJWt,deleteLayout)

module.exports = router;