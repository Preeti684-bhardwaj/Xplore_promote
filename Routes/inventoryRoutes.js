// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const inventoryController = require('../Controller/product/inventoryController');
const { verifyJWt,authorize, verifySession} = require("../middleware/auth");
const { verifyEncryption } = require("../middleware/encryption");


// Create a single product
router.post('/location',verifyJWt, authorize(["USER"]), verifySession , inventoryController.createLocation);

// Bulk create products
// router.post('/bulk', verifyJWt, authorize(["USER"]), verifySession ,productController.bulkCreateProducts);

// Get all products with filtering options
router.get('/location', verifyJWt, authorize(["USER"]), verifySession, inventoryController.getAllLocations);

// Get a single product by ID
router.get('/location/:id', verifyJWt, authorize(["USER"]), verifySession, inventoryController.updateLocation);

// Update a product
router.put('/location/:id', verifyJWt, authorize(["USER"]), verifySession,inventoryController.updateLocation);

// Bulk update products
// router.put('/bulk', verifyJWt, authorize(["USER"]), verifySession,  productController.bulkUpdateProducts);

// Delete a product
router.delete('/location/:id', verifyJWt, authorize(["USER"]), verifySession,  inventoryController.deleteLocation);



router.post('/',verifyJWt, authorize(["USER"]), verifySession , inventoryController.createInventory);

// Get all products with filtering options
router.get('/', verifyJWt, authorize(["USER"]), verifySession,  inventoryController.getAllInventory);
 
// Get a single product by ID
router.get('/:id', verifyJWt, authorize(["USER"]), verifySession,  inventoryController.getOneInventory);

// Update a product
router.put('/:id', verifyJWt, authorize(["USER"]), verifySession, inventoryController.updateInventory);

// Bulk update products
// router.put('/variant/bulk', verifyJWt, authorize(["USER"]), verifySession,  VariantController.bul);

// Delete a product
router.delete('/:id', verifyJWt, authorize(["USER"]), verifySession,  inventoryController.deleteInventory);
module.exports = router;