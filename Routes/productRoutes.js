// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const productController = require('../Controller/product/productController');
const VariantController = require('../Controller/product/productVarientController');
const { verifyJWt,authorize, verifySession} = require("../middleware/auth");
const { verifyEncryption } = require("../middleware/encryption");
const upload = require("../middleware/multer");


// Create a single product
router.post('/',verifyJWt, authorize(["USER"]), verifySession ,upload.array('images'), productController.createProduct);

// Bulk create products
router.post('/bulk', verifyJWt, authorize(["USER"]), verifySession ,productController.bulkCreateProducts);

// Get all products with filtering options
router.get('/', verifyEncryption,  productController.getAllProducts);

// Get a single product by ID
router.get('/:id', verifyEncryption, productController.getOneProduct);

// Update a product
router.put('/:id', verifyJWt, authorize(["USER"]), verifySession,  upload.array('images'), productController.updateProduct);

// Bulk update products
router.put('/bulk', verifyJWt, authorize(["USER"]), verifySession,  productController.bulkUpdateProducts);

// Delete a product
router.delete('/:id', verifyJWt, authorize(["USER"]), verifySession,  productController.deleteProduct);



router.post('/variant/',verifyJWt, authorize(["USER"]), verifySession ,upload.array('images'), VariantController.createVariant);

// Bulk create products
router.post('/variant/bulk', verifyJWt, authorize(["USER"]), verifySession ,VariantController.bulkCreateVariants);

// Get all products with filtering options
router.get('/variant/', verifyJWt, authorize(["USER"]), verifySession,  VariantController.getAllVariants);

// Get a single product by ID
router.get('/variant/:id', verifyJWt, authorize(["USER"]), verifySession,  VariantController.getOneVariant);

// Update a product
router.put('/variant/:id', verifyJWt, authorize(["USER"]), verifySession,  upload.array('images'), VariantController.updateVariant);

// Bulk update products
// router.put('/variant/bulk', verifyJWt, authorize(["USER"]), verifySession,  VariantController.bul);

// Delete a product
router.delete('/variant/:id', verifyJWt, authorize(["USER"]), verifySession,  VariantController.deleteVariant);
module.exports = router;