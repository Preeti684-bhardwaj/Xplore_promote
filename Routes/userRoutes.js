const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer");
const {
  registerUser,
  phoneVerification,
  sendPhoneOtp,
  sendOtp,
  emailVerification,
  loginUser,
  forgotPassword,
  resetPassword,
  getUserById,
  updateUser,
  deleteUser,
  getUserByToken,
  logout,
  logoutAll,
  getUserProfile,
  saveVisitorAndCampaign,
  getUserShortUrl,
  appleLogin,
  googleLogin,
} = require("../Controller/user/userController");
const { verifyJWt, authorize, verifySession } = require("../middleware/auth");
const { verifyEncryption } = require("../middleware/encryption");
const { getContactDetails } = require("../Controller/user/contactUsController");
const {
  createProfileLayout,
  getAllProfileLayout,
  getOneProfileLayout,
  getAllProfileLayoutName,
  updateProfileLayout,
  deleteProfileLayout,
} = require("../Controller/profileLayoutController");
const {
  updateChatbotConfig,
  createChatbotConfig,
  getAllChatbotConfig,
  assignChatbotToCampaign,
  removeChatbotFromCampaign,
} = require("../Controller/chatBot/chatBotConfigController");
const {
  createCashfreeConfig,getAllCashfreeConfig,assignCashfreeConfigToCampaign,removeCashfreeConfigFromCampaign
} = require("../Controller/payment/cashfree/configController")
const {
  createConfig,updateConfig,getAllConfig,assignConfigToCampaign,removeConfigFromCampaign
} = require("../Controller/user/whatsapp/whatsappConfigController");
const {createSmsConfig,
  updateSmsConfig,
  getAllSmsConfig,
  assignSmsConfigToCampaign,
  removeSmsConfigFromCampaign,} = require("../Controller/user/smsConfigController");


// ---------------configuration of chatbotb api--------------------------------
router.post("/chatBot/create",verifyJWt,authorize(["USER"]),verifySession,upload.array("files"),createChatbotConfig);
router.get("/chatBot/getAllConfig",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,getAllChatbotConfig);
router.put("/chatBot/update/:id",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,upload.array("files"),updateChatbotConfig);
router.post("/chatBot/assign-to-campaign",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,assignChatbotToCampaign);
router.post("/chatBot/remove-from-campaign",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,removeChatbotFromCampaign);

// -----------------------whatsapp configuration api--------------------------------
router.post("/whatsapp/create",verifyJWt,authorize(["USER"]),verifySession,createConfig);
router.get("/whatsapp/getAllConfig",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,getAllConfig);
router.put("/whatsapp/update/:id",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,updateConfig);
router.post("/whatsapp/assign-to-campaign",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,assignConfigToCampaign);
router.post("/whatsapp/remove-from-campaign",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,removeConfigFromCampaign);

// ------------------sms configuration api--------------------------------
router.post("/sms/create",verifyJWt,authorize(["USER"]),verifySession,createSmsConfig);
router.get("/sms/getAllConfig",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,getAllSmsConfig);
router.put("/sms/update/:id",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,updateSmsConfig);
router.post("/sms/assign-to-campaign",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,assignSmsConfigToCampaign);
router.post("/sms/remove-from-campaign",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,removeSmsConfigFromCampaign);


// -----------------profile layout json api-------------------------------- 
router.post("/profile/create",verifyJWt,authorize(["USER"]),verifySession,upload.array('files'),createProfileLayout);
router.get("/profile/getAll",verifyJWt,authorize(["USER"]),verifySession,getAllProfileLayout);
router.get("/profile/getAllLayoutName/:id", getAllProfileLayoutName);
router.get("/profile/getOne/:id", getOneProfileLayout);
router.put("/profile/update/:id",verifyJWt,authorize(["USER"]),verifySession,upload.array('files'),updateProfileLayout);
router.delete("/profile/delete/:shortCode",verifyJWt,authorize(["USER"]),verifySession,deleteProfileLayout);
// router.get("/profile/getLayout/:shortCode",getAllProfileLayoutByShortCode);

// ----------------payment configuration api--------------------------------
router.post("/cashfree/create",verifyJWt,authorize(["USER"]),verifySession,createCashfreeConfig);
router.get("/cashfree/getAllConfig",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,getAllCashfreeConfig);
// router.put(
//   "/cashfree/update/:id",
//   verifyJWt,
//   authorize(["ADMIN", "USER"]),
//   verifySession,
//   updateCashfreeConfig
// );
router.post("/cashfree/assign-to-campaign",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,assignCashfreeConfigToCampaign);
router.post("/cashfree/remove-from-campaign",verifyJWt,authorize(["ADMIN", "USER"]),verifySession,removeCashfreeConfigFromCampaign);

// ----------------user authentication main app api--------------------------------
router.post("/register", registerUser);
router.post("/sendOtp", sendOtp);
router.post("/signUp", emailVerification);
router.post("/login", loginUser);
router.post("/password/forgot", forgotPassword);
router.post("/password/reset/:userId", resetPassword);
router.get("/getById/:id", getUserById);
router.post("/sendPhoneOtp", sendPhoneOtp);
router.post("/phoneVerification", phoneVerification);
router.get("/getUserByToken",verifyJWt,authorize(["USER"]),verifySession,getUserByToken);
//--------------get user profile layout--------------------------------
router.get("/getUserProfile/:id", getUserProfile);
router.put("/updateUser",verifyJWt,authorize(["USER"]),upload.fields([{ name: "userImages", maxCount: 5 },{ name: "companyImages", maxCount: 5 },]),updateUser);
router.delete("/deleteUser", verifyJWt, authorize(["USER"]), deleteUser);
// -------------logout user from web--------------------------------
router.delete("/logout", verifyJWt, authorize(["USER"]), logout);
router.delete("/logoutAll", verifyJWt, authorize(["USER"]), logoutAll);
//--------------Apple Sign In routes--------------------------------
router.post("/appleSignin", appleLogin);
// --------------Google Sign In routes--------------------------------
router.post("/googleSignin", googleLogin);
// ----------------save visitor Id--------------------------------
router.post("/saveVisitorAndCampaign", saveVisitorAndCampaign);
router.get("/getSubmittedContact/:campaignID",verifyJWt,authorize(["USER"]),verifySession,getContactDetails);
router.get("/profileLayout/:shortCode", getUserShortUrl);

module.exports = router;
