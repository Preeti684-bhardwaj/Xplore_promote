const express = require("express");
const router = express.Router();
const { handleChatRequest } = require("../Controller/chatBot/chatController");
const { getCampaignChatbotConfig } = require("../Controller/chatBot/chatBotConfigController");
const {
  getJsonQuestion,
} = require("../Controller/chatBot/chatBotConfigController");
const { verifyEncryption } = require("../middleware/encryption");

router.get("/getquestions",getJsonQuestion);
router.get("/config/:campaignId", getCampaignChatbotConfig);
router.post("/chat",handleChatRequest);

module.exports = router;
