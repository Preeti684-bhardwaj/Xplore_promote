const express = require("express");
const router = express.Router();
const {
  adminSignup,
  adminSignin,
  updateBusinessUser,
  createClientLogin,
  assignCampaignToClient,
  removeCampaignFromClient,
  getAllAssignedCampaign
} = require("../Controller/adminController");
const {verifyJWt, verifyAdmin, authorize } = require("../middleware/auth");

router.post("/signUp", adminSignup);
router.post("/login", adminSignin);
// router.post("/password/forgot",forgotPassword)
// router.post("/password/reset/:userId",resetPassword)
// router.get("/getById/:id",getUserById)
//------------------- get all assigned campaign -------------
router.get("/getAll", verifyJWt,authorize(["CLIENT"]),getAllAssignedCampaign);

router.put(
  "/updateBusinessUser",
  verifyAdmin,
  authorize(["ADMIN"]),
  updateBusinessUser
);
router.put(
  "/createClientLogin",
  verifyAdmin,
  authorize(["ADMIN"]),
  createClientLogin
);
router.post("/assignCampaignWithClient", verifyAdmin,
  authorize(["ADMIN"]),assignCampaignToClient)

router.delete("/removeCampaignWithClient", verifyAdmin,
    authorize(["ADMIN"]),removeCampaignFromClient) 

module.exports = router;
