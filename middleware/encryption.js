const crypto = require('crypto');
const { keyManager } = require('../config/keys');

const verifyEncryption = (req, res, next) => {
    try {
        const encryptedHeader = req.headers['x-encrypted-auth'];
        const timestamp = req.headers['x-timestamp'];

        // Log request attempt (remove in production or log securely)
        console.log(`Auth attempt from ${req.ip} at ${new Date().toISOString()}`);

        if (!encryptedHeader || !timestamp) {
            console.warn(`Missing headers from ${req.ip}`);
            return res.status(401).json({ error: 'Missing required headers' });
        }

        // Verify timestamp is within acceptable range (e.g., 5 minutes)
        const requestTime = new Date(parseInt(timestamp));
        const now = new Date();
        const timeDiff = Math.abs(now - requestTime);
        
        if (timeDiff > 5 * 60 * 1000) { // 5 minutes
            console.warn(`Expired timestamp from ${req.ip}`);
            return res.status(401).json({ error: 'Request expired' });
        }

        // Get the text to verify from request body
        const textToVerify = JSON.stringify(req.body);

        // Recreate the hash on server side
        const serverHash = crypto
            .createHash('sha256')
            .update(`${textToVerify}${keyManager.getCurrentKey()}${timestamp}`)
            .digest('hex');

        if (serverHash !== encryptedHeader) {
            console.warn(`Invalid hash from ${req.ip}`);
            return res.status(401).json({ error: 'Invalid authentication' });
        }

        next();
    } catch (error) {
        console.error('Encryption verification failed:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = { verifyEncryption };