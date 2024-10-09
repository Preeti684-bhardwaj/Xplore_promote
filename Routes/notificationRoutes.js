const express = require("express");
const router = express.Router();
const {
notification
} = require("../Controller/notificationController");

router.post("/notification", notification);


module.exports = router;