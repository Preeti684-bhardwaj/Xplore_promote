const express = require("express");
const router = express.Router();
const {
  getAllAssignedCampaign
} = require("../Controller/adminController");
const {
  loginUser
} = require("../Controller/userController");
const {exportContactsToExcel}=require("../Controller/contactUsController")
const {verifyJWt,authorize } = require("../middleware/auth");
const { getContactDetails } = require("../Controller/adminController");


// ------------login client----------------------------
router.post("/login", loginUser);
//------------------- get all assigned campaign -------------
router.get("/getAll", verifyJWt,authorize(["CLIENT"]),getAllAssignedCampaign);
// -----------------get campaign analytics-------------------------------------
router.get("/getSubmittedContact/:campaignID", verifyJWt,authorize(["CLIENT"]), getContactDetails);
router.get('/export-contacts/:campaignID', exportContactsToExcel);

module.exports = router;
