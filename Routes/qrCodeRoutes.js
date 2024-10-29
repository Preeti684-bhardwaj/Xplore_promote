const express = require('express');
const router = express.Router();
const { generateQR, verifyQRLogin } = require('../Controller/qrCodeController');

router.post('/generate', generateQR);
router.post('/verify', verifyQRLogin);

module.exports = router;