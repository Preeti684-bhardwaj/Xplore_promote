const express = require("express");
const router = express.Router();
const {
  loginUser
} = require("../Controller/user/userController");
const {exportContactsToExcel}=require("../Controller/user/contactUsController")
const {verifyJWt,authorize } = require("../middleware/auth");
const { getAllAssignedCampaign,getContactDetails } = require("../Controller/user/adminController");


// ------------login client----------------------------
router.post("/login", loginUser);
//------------------- get all assigned campaign -------------
router.get("/getAll", verifyJWt,authorize(["CLIENT"]),getAllAssignedCampaign);
// -----------------get campaign analytics-------------------------------------
router.get("/getSubmittedContact/:campaignID", verifyJWt,authorize(["CLIENT"]), getContactDetails);
router.get('/export-contacts/:campaignID', exportContactsToExcel);

module.exports = router;
