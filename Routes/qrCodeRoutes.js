const express = require('express');
const router = express.Router();
const { generateQR, verifyQRLogin } = require('../Controller/qrCodeController');
const { verifyJWt ,verifyUserAgent} = require("../middleware/auth");

router.post('/generate',verifyUserAgent,generateQR);
router.post('/verify', verifyJWt,verifyQRLogin);

module.exports = router;