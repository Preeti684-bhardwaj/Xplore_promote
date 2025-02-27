const express = require("express");
const router = express.Router();
const { handleChatRequest } = require("../Controller/chatController");
const {
  uploadPredibaseConfig,
  getCsvFile,
  getJsonQuestion,
  updateProxyConfig,
  updateAdapterName,
  uploadGeminiConfig
} = require("../Controller/configController");
const {verifyJWt, verifyAdmin, authorize,verifySession } = require("../middleware/auth");
const { verifyEncryption } = require("../middleware/encryption");
const upload = require("../middleware/multer");

// router.post('/config',verifyAdmin,
//     authorize(["ADMIN"]), createOrUpdateConfig);
router.post("/upload" ,verifyAdmin,authorize(["ADMIN","USER"]),verifySession,upload.array("files"),uploadPredibaseConfig);
router.post("/geminiconfig" ,verifyAdmin,authorize(["ADMIN","USER"]),verifySession,upload.array("files"),uploadGeminiConfig);
router.get("/getcsvfile",verifyAdmin,authorize(["ADMIN","USER"]),verifySession, getCsvFile);
router.get("/getquestions",verifyEncryption, getJsonQuestion);
router.post("/config",verifyAdmin,authorize(["ADMIN","USER"]),verifySession,verifyEncryption, updateProxyConfig);
router.put("/update",verifyAdmin,authorize(["ADMIN","USER"]),verifySession,updateAdapterName)
router.post("/chat", verifyEncryption,handleChatRequest);

module.exports = router;
