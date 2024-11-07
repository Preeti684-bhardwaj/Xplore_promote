const express = require('express');
const router = express.Router();
const { generateQR, verifyQRLogin,getQrSession } = require('../Controller/qrCodeController');
const { verifyJWt ,verifyUserAgent} = require("../middleware/auth");

router.post('/generate',verifyUserAgent,generateQR);
router.post('/verify', verifyJWt,verifyQRLogin);
router.get('/getSessions',verifyJWt,getQrSession)

module.exports = router;