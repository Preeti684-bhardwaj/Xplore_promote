const crypto = require("crypto");
const { keyManager } = require("../config/keys");

const verifyEncryption = (req, res, next) => {
  try {
    const encryptedHeader = req.headers["x-encrypted-auth"];
    // const timestamp = req.headers["x-timestamp"];

    // Log request attempt (remove in production or log securely)
    console.log(`Auth attempt from ${req.ip} at ${new Date().toISOString()}`);
    console.log("Received encrypted header:", encryptedHeader);

    if (!encryptedHeader) {
      console.warn(`Missing headers from ${req.ip}`);
      return res.status(401).json({ error: "Missing required headers" });
    }

    // Get current key and generate hash
    const currentKey = keyManager.getCurrentKey();
    console.log("Using key:", currentKey); // For debugging

    // Compare the hashes
    if (currentKey !== encryptedHeader) {
      console.warn(`Invalid hash from ${req.ip}`);
      console.warn("Expected:", currentKey);
      console.warn("Received:", encryptedHeader);
      return res.status(401).json({ error: "Invalid authentication" });
    }

    next();
  } catch (error) {
    console.error("Encryption verification failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { verifyEncryption };
