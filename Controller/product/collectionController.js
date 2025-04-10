// controllers/collectionController.js
const db = require("../../dbConfig/dbConfig");
const Collection = db.Collection;
const Product = db.Product;
const { uploadFile } = require("../../utils/cdnImplementation");

// Create a new collection
exports.createCollection = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    // Extract collection data from request body
    const { name, description, seo_title, seo_description, is_active } = req.body;
    const userId = req.user.id; 
    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Collection name is required"
      });
    }
    
    // Handle image upload if provided
    let imageData = null;
    if (req.file) {
      const uploadedImage = await uploadFile(req.file);
      imageData = uploadedImage;
    }
    
    // Create collection record
    const newCollection = await Collection.create({
      name,
      description,
      seo_title,
      seo_description,
      is_active: is_active !== undefined ? is_active : true,
      image: imageData,
      user_id: userId
    }, { transaction });
    
    await transaction.commit();
    
    return res.status(201).json({
      success: true,
      message: "Collection created successfully",
      data: newCollection
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating collection:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to create collection",
      error: error.message
    });
  }
};

// Get all collections
exports.getAllCollections = async (req, res) => {
  try {
    const collections = await Collection.findAll({
      where: { user_id: req.user.id}, // Filter by user
      include: [{
        model: Product,
        through: { attributes: [] } // Don't include junction table attributes
      }]
    });
    
    return res.status(200).json({
      success: true,
      message: "Collections retrieved successfully",
      data: collections
    });
  } catch (error) {
    console.error("Error retrieving collections:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve collections",
      error: error.message
    });
  }
};

// Get a single collection by ID
exports.getOneCollection = async (req, res) => {
  try {
    const collectionId = req.params.id;
    
    const collection = await Collection.findOne({
      where: { 
        id: collectionId,
        user_id: req.user.id
      },
      include: [{
        model: Product,
        through: { attributes: [] }
      }]
    });
    
    if (!collection) {
      return res.status(404).json({
        success: false,
        message: "Collection not found"
      });
    }
    
    return res.status(200).json({
      success: true,
      message: "Collection retrieved successfully",
      data: collection
    });
  } catch (error) {
    console.error("Error retrieving collection:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve collection",
      error: error.message
    });
  }
};

// Update a collection
exports.updateCollection = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const collectionId = req.params.id;
    const { name, description, seo_title, seo_description, is_active } = req.body;
    
    // Find collection to update
    const collection = await Collection.findOne({
      where: { 
        id: collectionId,
        user_id: req.user.id
      }
    });
    
    if (!collection) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Collection not found"
      });
    }
    
    // Handle image upload if provided
    let imageData = collection.image;
    if (req.file) {
      const uploadedImage = await uploadFile(req.file);
      imageData = uploadedImage;
    }
    
    // Update collection fields
    const updatedCollection = await collection.update({
      name: name || collection.name,
      description: description !== undefined ? description : collection.description,
      seo_title: seo_title !== undefined ? seo_title : collection.seo_title,
      seo_description: seo_description !== undefined ? seo_description : collection.seo_description,
      is_active: is_active !== undefined ? is_active : collection.is_active,
      image: imageData
    }, { transaction });
    
    await transaction.commit();
    
    return res.status(200).json({
      success: true,
      message: "Collection updated successfully",
      data: updatedCollection
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating collection:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to update collection",
      error: error.message
    });
  }
};

// Delete a collection
exports.deleteCollection = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const collectionId = req.params.id;
    
    // Find collection to delete
    const collection = await Collection.findOne({
      where: { 
        id: collectionId,
        user_id: req.user.id
      }
    });
    
    if (!collection) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Collection not found"
      });
    }
    
    // Delete collection and associated relationships
    await collection.destroy({ transaction });
    
    await transaction.commit();
    
    return res.status(200).json({
      success: true,
      message: "Collection deleted successfully"
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting collection:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to delete collection",
      error: error.message
    });
  }
};