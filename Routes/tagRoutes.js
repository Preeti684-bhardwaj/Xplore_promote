const express = require('express');
const router = express.Router();
const tagController = require('../Controller/product/tagsController.js');
const { verifyJWt,authorize, verifySession} = require("../middleware/auth");


// Tag CRUD operations
router.post('/',verifyJWt, authorize(["USER"]), verifySession ,  tagController.createTag);
router.post('/bulk', tagController.bulkCreateTags);
router.get('/',verifyJWt, authorize(["USER"]), verifySession , tagController.getAllTags);
router.get('/:id',verifyJWt, authorize(["USER"]), verifySession ,  tagController.getOneTag);
router.put('/:id',verifyJWt, authorize(["USER"]), verifySession ,  tagController.updateTag);
router.put('/bulk',verifyJWt, authorize(["USER"]), verifySession ,  tagController.bulkUpdateTags);
router.delete('/:id',verifyJWt, authorize(["USER"]), verifySession ,  tagController.deleteTag);
router.delete('/bulk',verifyJWt, authorize(["USER"]), verifySession ,  tagController.bulkDeleteTags);

// Tag-Product association operations
router.post('/:id/products',verifyJWt, authorize(["USER"]), verifySession , tagController.associateProducts);
router.delete('/:id/products',verifyJWt, authorize(["USER"]), verifySession , tagController.disassociateProducts);

module.exports = router;