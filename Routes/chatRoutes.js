const express = require('express');
const router = express.Router();
const {handleChatRequest} = require('../Controller/chatController');
const {createOrUpdateConfig}=require('../Controller/configController');
const {verifyAdmin, authorize } = require("../middleware/auth");

router.post('/config',verifyAdmin,
    authorize(["ADMIN"]), createOrUpdateConfig);
router.post('/chat', handleChatRequest);

module.exports = router;