const express = require('express');
const router = express.Router();
const { generateQR, verifyQRLogin } = require('../Controller/qrCodeController');
const { verifyJWt } = require("../middleware/auth");

router.post('/generate', generateQR);
router.post('/verify', verifyJWt,verifyQRLogin);

module.exports = router;