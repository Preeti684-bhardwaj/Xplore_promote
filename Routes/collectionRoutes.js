// routes/collectionRoutes.js
const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer");
const collectionController = require("../Controller/product/collectionController");
const { verifyJWt,authorize, verifySession} = require("../middleware/auth");
const { verifyEncryption } = require("../middleware/encryption");

// Create a collection (with optional image)
router.post("/", verifyJWt, authorize(["USER"]), verifySession, upload.single("image"), collectionController.createCollection);

// Get all collections for authenticated user
router.get("/", verifyEncryption, collectionController.getAllCollections);

// Get a specific collection by ID
router.get("/:id", verifyJWt, authorize(["USER"]), verifySession,collectionController.getOneCollection);

// Update a collection (with optional image)
router.put("/:id", verifyJWt, authorize(["USER"]), verifySession,upload.single("image"), collectionController.updateCollection);

// Delete a collection
router.delete("/:id", verifyJWt, authorize(["USER"]), verifySession, collectionController.deleteCollection);

module.exports = router;
