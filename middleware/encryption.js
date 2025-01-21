const crypto = require("crypto");
const { keyManager } = require("../config/keys");

// This function exactly mirrors the Android implementation
const generateHash = (authKey, timestamp) => {
  const dataToEncrypt = `${authKey}${timestamp}`;
  console.log('Data to encrypt:', dataToEncrypt); // For debugging
  
  const hashBytes = crypto
    .createHash("sha256")
    .update(dataToEncrypt, 'utf8')
    .digest();
    
    // return hashBytes;
  // Mirror Android's formatting exactly: hashBytes.joinToString("") { "%02x".format(it) }
  return Array.from(hashBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

const verifyEncryption = (req, res, next) => {
  try {
    const encryptedHeader = req.headers["x-encrypted-auth"];
    const timestamp = req.headers["x-timestamp"];

    // Log request attempt (remove in production or log securely)
    console.log(`Auth attempt from ${req.ip} at ${new Date().toISOString()}`);
    console.log('Received encrypted header:', encryptedHeader);
    console.log('Received timestamp:', timestamp);

    if (!encryptedHeader || !timestamp) {
      console.warn(`Missing headers from ${req.ip}`);
      return res.status(401).json({ error: "Missing required headers" });
    }

    // Get current key and generate hash
    const currentKey = keyManager.getCurrentKey();
    console.log('Using key:', currentKey); // For debugging
    
    const serverHash = generateHash(currentKey, timestamp);
    console.log('Server generated hash:', serverHash); // For debugging

    // Compare the hashes
    if (serverHash !== encryptedHeader) {
      console.warn(`Invalid hash from ${req.ip}`);
      console.warn('Expected:', serverHash);
      console.warn('Received:', encryptedHeader);
      return res.status(401).json({ error: "Invalid authentication" });
    }

    next();
  } catch (error) {
    console.error("Encryption verification failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { verifyEncryption};