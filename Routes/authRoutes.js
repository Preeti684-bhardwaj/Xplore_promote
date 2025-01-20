const express = require('express');
const router = express.Router();
const { keyManager } = require('../config/keys');


// Route to get authentication key
router.get('/key', (req, res) => {
    try {
        const key = keyManager.getCurrentKey();
        res.json({ key });
    } catch (error) {
        console.error('Error getting key:', error);
        res.status(500).json({ error: 'Failed to generate key' });
    }
});

module.exports = router;