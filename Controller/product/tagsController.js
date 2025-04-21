const db = require("../../dbConfig/dbConfig");
const Tag = db.Tag;
const Product = db.Product;
const { Op } = require("sequelize");

// Create a new tag
exports.createTag = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { name } = req.body;

    // Validate required fields
    if (!name) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Tag name is required"
      });
    }

    // Check if tag already exists
    const existingTag = await Tag.findOne({
      where: { name },
      transaction
    });

    if (existingTag) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "A tag with this name already exists"
      });
    }

    // Create new tag
    const newTag = await Tag.create({ name }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: "Tag created successfully",
      data: newTag
    });
  } catch (error) {
    // Make sure to rollback if error occurs
    if (transaction) {
      await transaction.rollback();
    }
    console.error("Error creating tag:", error);

    if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors.map(e => ({ field: e.path, message: e.message }))
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create tag",
      error: error.message
    });
  }
};

// Bulk create tags
exports.bulkCreateTags = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { tags } = req.body;

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Tags array is required",
      });
    }

    const createdTags = [];
    const existingTags = [];

    // Get all tag names for checking duplicates
    const tagNames = tags.map(tag => tag.name);
    const existingTagsInDB = await Tag.findAll({
      where: { 
        name: { [Op.in]: tagNames } 
      },
      transaction
    });

    const existingTagNames = existingTagsInDB.map(tag => tag.name);

    // Process each tag in the array
    for (const tagData of tags) {
      // Validate required fields
      if (!tagData.name) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Tag name is required for all tags",
        });
      }

      // Skip if tag already exists in DB
      if (existingTagNames.includes(tagData.name)) {
        existingTags.push(tagData.name);
        continue;
      }

      // Create tag record
      const newTag = await Tag.create(
        {
          name: tagData.name
        },
        { transaction }
      );

      // Add created tag to array
      createdTags.push(newTag);
    }

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: `${createdTags.length} tags created successfully`,
      data: {
        created: createdTags,
        existing: existingTags.length > 0 ? existingTags : null
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error bulk creating tags:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to bulk create tags",
      error: error.message,
    });
  }
};

// Get all tags
exports.getAllTags = async (req, res) => {
  try {
    // Extract query parameters for filtering and pagination
    const {
      search,
      limit = 50,
      offset = 0,
      sort_by = "name",
      sort_direction = "ASC",
      include_product_count = false
    } = req.query;

    // Build query conditions
    const where = {};

    // Search by name
    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
    }

    // Setup sort options
    const order = [[sort_by === "product_count" ? "products_count" : sort_by, sort_direction]];

    // Build query options
    const queryOptions = {
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order,
      distinct: true
    };

    // Include products count if requested
    if (include_product_count === "true" || include_product_count === true) {
      queryOptions.include = [{
        model: Product,
        attributes: [],
        through: { attributes: [] }
      }];
      queryOptions.attributes = {
        include: [
          [db.sequelize.fn("COUNT", db.sequelize.col("Products.id")), "products_count"]
        ]
      };
      queryOptions.group = ["Tag.id"];
    }
    
    // Get count of all matching tags first
    const totalCount = await Tag.count({ where });

    // Then get the actual tags with any included associations
    const tags = await Tag.findAll(queryOptions);

    return res.status(200).json({
      success: true,
      message: "Tags retrieved successfully",
      data: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        tags
      },
    });
  } catch (error) {
    console.error("Error retrieving tags:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve tags",
      error: error.message,
    });
  }
};

// Get a single tag by ID
exports.getOneTag = async (req, res) => {
  try {
    const tagId = req.params.id;

    const tag = await Tag.findByPk(tagId, {
      include: [{
        model: Product,
        through: { attributes: [] }
      }]
    });

    if (!tag) {
      return res.status(404).json({
        success: false,
        message: "Tag not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Tag retrieved successfully",
      data: tag,
    });
  } catch (error) {
    console.error("Error retrieving tag:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve tag",
      error: error.message,
    });
  }
};

// Update a tag
exports.updateTag = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const tagId = req.params.id;
    const { name } = req.body;

    // Find tag to update
    const tag = await Tag.findByPk(tagId);

    if (!tag) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Tag not found",
      });
    }

    // Validate required fields
    if (!name) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Tag name is required"
      });
    }

    // Check if another tag already has this name
    if (name !== tag.name) {
      const existingTag = await Tag.findOne({
        where: { 
          name,
          id: { [Op.ne]: tagId } 
        },
        transaction
      });

      if (existingTag) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "A tag with this name already exists"
        });
      }
    }

    // Update tag
    await tag.update({ name }, { transaction });

    await transaction.commit();

    // Fetch the updated tag with its products
    const updatedTag = await Tag.findByPk(tagId, {
      include: [{
        model: Product,
        through: { attributes: [] }
      }]
    });

    return res.status(200).json({
      success: true,
      message: "Tag updated successfully",
      data: updatedTag,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating tag:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update tag",
      error: error.message,
    });
  }
};

// Bulk update tags
exports.bulkUpdateTags = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { tags } = req.body;

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Tags array is required",
      });
    }

    const updatedTags = [];
    const notFoundTags = [];
    const duplicateNames = [];

    // Get all existing tag names to check for duplicates
    const tagIds = tags.map(tag => tag.id);
    const existingTags = await Tag.findAll({
      where: { id: { [Op.in]: tagIds } },
      transaction
    });
    
    // Create a map of existing tags by ID for quick access
    const tagMap = existingTags.reduce((map, tag) => {
      map[tag.id] = tag;
      return map;
    }, {});

    // Process each tag in the array
    for (const tagData of tags) {
      // Validate tag ID
      if (!tagData.id) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Tag ID is required for all tags in bulk update",
        });
      }

      // Validate tag name
      if (!tagData.name) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Tag name is required for all tags",
        });
      }

      // Find tag to update
      const tag = tagMap[tagData.id];

      if (!tag) {
        notFoundTags.push(tagData.id);
        continue;
      }

      // Check for duplicate names
      const duplicateCheck = await Tag.findOne({
        where: { 
          name: tagData.name,
          id: { [Op.ne]: tagData.id }
        },
        transaction
      });

      if (duplicateCheck) {
        duplicateNames.push({
          id: tagData.id,
          name: tagData.name
        });
        continue;
      }

      // Update tag
      await tag.update(
        { name: tagData.name },
        { transaction }
      );

      updatedTags.push(tagData.id);
    }

    // If there are any not found tags, send error
    if (notFoundTags.length > 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Some tags were not found",
        notFoundTags
      });
    }

    // If there are any duplicate names, send error
    if (duplicateNames.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Some tag names already exist",
        duplicateNames
      });
    }

    await transaction.commit();

    // Fetch all updated tags
    const completedTags = await Tag.findAll({
      where: { id: updatedTags },
      include: [{
        model: Product,
        through: { attributes: [] }
      }]
    });

    return res.status(200).json({
      success: true,
      message: `${updatedTags.length} tags updated successfully`,
      data: completedTags,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error bulk updating tags:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to bulk update tags",
      error: error.message,
    });
  }
};

// Delete a tag
exports.deleteTag = async (req, res) => {
    const transaction = await db.sequelize.transaction();
  
    try {
      const tagId = req.params.id;
  
      // Find tag to delete
      const tag = await Tag.findByPk(tagId);
  
      if (!tag) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "Tag not found",
        });
      }
  
      // Check if this tag is associated with any products
      const associatedProducts = await tag.countProducts();
      
      // Disassociate all products from this tag before deletion
      if (associatedProducts > 0) {
        await tag.setProducts([], { transaction });
      }
  
      // Delete tag
      await tag.destroy({ transaction });
  
      await transaction.commit();
  
      return res.status(200).json({
        success: true,
        message: `Tag deleted successfully. ${associatedProducts > 0 ? `${associatedProducts} product associations were removed.` : ''}`,
        disassociatedProducts: associatedProducts > 0 ? associatedProducts : 0
      });
    } catch (error) {
      await transaction.rollback();
      console.error("Error deleting tag:", error);
  
      return res.status(500).json({
        success: false,
        message: "Failed to delete tag",
        error: error.message,
      });
    }
  };
  
  // Bulk delete tags
  exports.bulkDeleteTags = async (req, res) => {
    const transaction = await db.sequelize.transaction();
  
    try {
      const { ids } = req.body;
  
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Tag IDs array is required",
        });
      }
  
      // Find tags to delete
      const tags = await Tag.findAll({
        where: { id: { [Op.in]: ids } },
        include: [{
          model: Product,
          attributes: ['id'],
          through: { attributes: [] }
        }]
      });
  
      if (tags.length === 0) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "No tags found with the provided IDs",
        });
      }
  
      // Keep track of how many product associations were removed
      let totalDisassociations = 0;
  
      // Disassociate products from each tag before deletion
      for (const tag of tags) {
        if (tag.Products && tag.Products.length > 0) {
          await tag.setProducts([], { transaction });
          totalDisassociations += tag.Products.length;
        }
      }
  
      // Delete all tags
      await Tag.destroy({
        where: { id: { [Op.in]: ids } },
        transaction
      });
  
      await transaction.commit();
  
      return res.status(200).json({
        success: true,
        message: `${tags.length} tags deleted successfully${totalDisassociations > 0 ? `. ${totalDisassociations} product associations were removed.` : ''}`,
        deletedCount: tags.length,
        disassociatedProducts: totalDisassociations
      });
    } catch (error) {
      await transaction.rollback();
      console.error("Error bulk deleting tags:", error);
  
      return res.status(500).json({
        success: false,
        message: "Failed to bulk delete tags",
        error: error.message,
      });
    }
  };

// Associate products with a tag
exports.associateProducts = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const tagId = req.params.id;
    const { productIds } = req.body;

    // Validate product IDs
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Product IDs array is required",
      });
    }

    // Find tag
    const tag = await Tag.findByPk(tagId);

    if (!tag) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Tag not found",
      });
    }

    // Find products
    const products = await Product.findAll({
      where: { id: { [Op.in]: productIds } },
    });

    if (products.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "No products found with the provided IDs",
      });
    }

    // Associate products with tag
    await tag.addProducts(products, { transaction });

    await transaction.commit();

    // Fetch updated tag with associated products
    const updatedTag = await Tag.findByPk(tagId, {
      include: [{
        model: Product,
        through: { attributes: [] }
      }]
    });

    return res.status(200).json({
      success: true,
      message: `${products.length} products associated with tag successfully`,
      data: updatedTag
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error associating products with tag:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to associate products with tag",
      error: error.message,
    });
  }
};

// Disassociate products from a tag
exports.disassociateProducts = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const tagId = req.params.id;
    const { productIds } = req.body;

    // Validate product IDs
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Product IDs array is required",
      });
    }

    // Find tag
    const tag = await Tag.findByPk(tagId);

    if (!tag) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Tag not found",
      });
    }

    // Find products
    const products = await Product.findAll({
      where: { id: { [Op.in]: productIds } },
    });

    if (products.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "No products found with the provided IDs",
      });
    }

    // Disassociate products from tag
    await tag.removeProducts(products, { transaction });

    await transaction.commit();

    // Fetch updated tag with remaining associated products
    const updatedTag = await Tag.findByPk(tagId, {
      include: [{
        model: Product,
        through: { attributes: [] }
      }]
    });

    return res.status(200).json({
      success: true,
      message: `${products.length} products disassociated from tag successfully`,
      data: updatedTag
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error disassociating products from tag:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to disassociate products from tag",
      error: error.message,
    });
  }
};