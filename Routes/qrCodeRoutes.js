const express = require('express');
const router = express.Router();
const { generateQR, verifyQRLogin,getQrSession } = require('../Controller/user/qrCodeController')
const { verifyJWt ,authorize, verifyUserAgent} = require("../middleware/auth");


router.post('/generate',verifyUserAgent,generateQR);
router.post('/verify', verifyJWt,authorize(["USER"]),verifyQRLogin);
router.get('/getSessions',verifyJWt,authorize(["USER"]),getQrSession)

module.exports = router;