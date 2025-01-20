const crypto = require('crypto');

class AuthKeyManager {
    constructor(options = {}) {
        this.keyDuration = options.keyDuration || 24 * 60 * 60 * 1000; // 24 hours default
        this.currentKey = null;
        this.keyExpiry = null;
        this.generateNewKey();
    }

    generateNewKey() {
        try {
            this.currentKey = crypto.randomBytes(32).toString('hex');
            this.keyExpiry = new Date(Date.now() + this.keyDuration);
            return this.currentKey;
        } catch (error) {
            console.error('Error generating new key:', error);
            throw new Error('Failed to generate new key');
        }
    }

    getCurrentKey() {
        try {
            if (!this.currentKey || new Date() > this.keyExpiry) {
                return this.generateNewKey();
            }
            return this.currentKey;
        } catch (error) {
            console.error('Error in getCurrentKey:', error);
            return this.generateNewKey(); // Fallback to new key
        }
    }

    isKeyValid() {
        return this.currentKey && new Date() <= this.keyExpiry;
    }
}

const keyManager = new AuthKeyManager();
module.exports = { keyManager };
