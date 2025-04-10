const db = require("../../dbConfig/dbConfig");
const { uploadFiles } = require("../../utils/cdnImplementation");
const ProductVariant = db.ProductVariant;
const Product = db.Product;
const Inventory = db.Inventory;
const InventoryLocation = db.InventoryLocation;
const Attribute = db.Attribute;

// Create a single variant
exports.createVariant = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const productId = req.params.productId;
    
    // Check if product exists
    const product = await Product.findByPk(productId);
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }
    
    // Extract variant data
    const { 
      price, compare_at_price, barcode, weight, weight_unit,
      requires_shipping, is_taxable, is_active, attributes, inventory
    } = req.body;
    
    // Validate required fields
    if (!price) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Price is required"
      });
    }
    
    // Handle variant images if any
    let variantImages = [];
    if (req.files && req.files.length > 0) {
      const uploadedImages = await uploadFiles(req.files);
      variantImages = uploadedImages;
    }
    
    // Create variant
    const newVariant = await ProductVariant.create({
      product_id: productId,
      price,
      compare_at_price,
      barcode,
      weight,
      weight_unit,
      requires_shipping: requires_shipping !== undefined ? requires_shipping : true,
      is_taxable: is_taxable !== undefined ? is_taxable : true,
      is_active: is_active !== undefined ? is_active : true,
      images: variantImages
    }, { transaction });
    
    // Process attributes if provided
    if (attributes && attributes.length > 0) {
      // Parse attributes if they came as a string
      const attributesArray = typeof attributes === 'string' 
        ? JSON.parse(attributes) 
        : attributes;
      
      for (const attr of attributesArray) {
        // Find or create attribute
        const [attribute] = await Attribute.findOrCreate({
          where: { name: attr.name },
          defaults: {
            display_name: attr.display_name || attr.name,
            type: attr.type || 'string'
          },
          transaction
        });
        
        // Associate attribute with variant
        await newVariant.addAttribute(attribute, { 
          through: { value: attr.value },
          transaction 
        });
      }
    }
    
    // Process inventory if provided
    if (inventory && inventory.length > 0) {
      // Parse inventory if it came as a string
      const inventoryArray = typeof inventory === 'string' 
        ? JSON.parse(inventory) 
        : inventory;
      
      for (const inv of inventoryArray) {
        // Check if location exists
        const location = await InventoryLocation.findByPk(inv.location_id, { transaction });
        
        if (!location) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Inventory location with ID ${inv.location_id} not found`
          });
        }
        
        // Create inventory record
        await Inventory.create({
          variant_id: newVariant.id,
          location_id: inv.location_id,
          quantity: inv.quantity || 0
        }, { transaction });
      }
    }
    
    await transaction.commit();
    
    // Get complete variant with associations
    const completeVariant = await ProductVariant.findByPk(newVariant.id, {
      include: [
        { model: Inventory, include: [InventoryLocation] },
        { model: Attribute, through: { attributes: ['value'] } }
      ]
    });
    
    return res.status(201).json({
      success: true,
      message: "Variant created successfully",
      data: completeVariant
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating variant:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to create variant",
      error: error.message
    });
  }
};

// Bulk create variants for a product
exports.bulkCreateVariants = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const productId = req.params.productId;
    
    // Check if product exists
    const product = await Product.findByPk(productId);
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }
    
    const { variants } = req.body;
    
    if (!variants || !Array.isArray(variants) || variants.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Variants array is required"
      });
    }
    
    const createdVariants = [];
    
    // Process each variant
    for (const variantData of variants) {
      // Validate required fields
      if (!variantData.price) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Price is required for all variants"
        });
      }
      
      // Create variant
      const newVariant = await ProductVariant.create({
        product_id: productId,
        price: variantData.price,
        compare_at_price: variantData.compare_at_price,
        barcode: variantData.barcode,
        weight: variantData.weight,
        weight_unit: variantData.weight_unit,
        requires_shipping: variantData.requires_shipping !== undefined ? variantData.requires_shipping : true,
        is_taxable: variantData.is_taxable !== undefined ? variantData.is_taxable : true,
        is_active: variantData.is_active !== undefined ? variantData.is_active : true,
        images: variantData.images || []
      }, { transaction });
      
      // Process attributes if provided
      if (variantData.attributes && variantData.attributes.length > 0) {
        for (const attr of variantData.attributes) {
          // Find or create attribute
          const [attribute] = await Attribute.findOrCreate({
            where: { name: attr.name },
            defaults: {
              display_name: attr.display_name || attr.name,
              type: attr.type || 'string'
            },
            transaction
          });
          
          // Associate attribute with variant
          await newVariant.addAttribute(attribute, { 
            through: { value: attr.value },
            transaction 
          });
        }
      }
      
      // Process inventory if provided
      if (variantData.inventory && variantData.inventory.length > 0) {
        for (const inv of variantData.inventory) {
          // Check if location exists
          const location = await InventoryLocation.findByPk(inv.location_id, { transaction });
          
          if (!location) {
            await transaction.rollback();
            return res.status(400).json({
              success: false,
              message: `Inventory location with ID ${inv.location_id} not found`
            });
          }
          
          // Create inventory record
          await Inventory.create({
            variant_id: newVariant.id,
            location_id: inv.location_id,
            quantity: inv.quantity || 0
          }, { transaction });
        }
      }
      
      createdVariants.push(newVariant.id);
    }
    
    await transaction.commit();
    
    // Get all created variants with associations
    const completeVariants = await ProductVariant.findAll({
      where: { id: createdVariants },
      include: [
        { model: Inventory, include: [InventoryLocation] },
        { model: Attribute, through: { attributes: ['value'] } }
      ]
    });
    
    return res.status(201).json({
      success: true,
      message: `${createdVariants.length} variants created successfully`,
      data: completeVariants
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error bulk creating variants:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to bulk create variants",
      error: error.message
    });
  }
};

// Get all variants for a product
exports.getAllVariants = async (req, res) => {
  try {
    const productId = req.params.productId;
    
    // Check if product exists
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }
    
    // Get all variants for the product
    const variants = await ProductVariant.findAll({
      where: { product_id: productId },
      include: [
        { model: Inventory, include: [InventoryLocation] },
        { model: Attribute, through: { attributes: ['value'] } }
      ]
    });
    
    return res.status(200).json({
      success: true,
      message: "Variants retrieved successfully",
      data: variants
    });
  } catch (error) {
    console.error("Error retrieving variants:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve variants",
      error: error.message
    });
  }
};

// Get a single variant by ID
exports.getOneVariant = async (req, res) => {
  try {
    const variantId = req.params.id;
    
    const variant = await ProductVariant.findByPk(variantId, {
      include: [
        { model: Inventory, include: [InventoryLocation] },
        { model: Attribute, through: { attributes: ['value'] } },
        { model: Product }
      ]
    });
    
    if (!variant) {
      return res.status(404).json({
        success: false,
        message: "Variant not found"
      });
    }
    
    return res.status(200).json({
      success: true,
      message: "Variant retrieved successfully",
      data: variant
    });
  } catch (error) {
    console.error("Error retrieving variant:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve variant",
      error: error.message
    });
  }
};

// Update a variant
exports.updateVariant = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const variantId = req.params.id;
    
    // Find variant to update
    const variant = await ProductVariant.findByPk(variantId);
    
    if (!variant) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Variant not found"
      });
    }
    
    // Extract update data
    const { 
      price, compare_at_price, barcode, weight, weight_unit,
      requires_shipping, is_taxable, is_active, attributes, inventory
    } = req.body;
    
    // Handle variant images if any
    let variantImages = variant.images || [];
    if (req.files && req.files.length > 0) {
      const uploadedImages = await uploadFiles(req.files);
      
      // If replace_images flag is set, replace all images
      if (req.body.replace_images === 'true') {
        variantImages = uploadedImages;
      } else {
        // Otherwise, append new images
        variantImages = [...variantImages, ...uploadedImages];
      }
    }
    
    // Update variant
    await variant.update({
      price: price || variant.price,
      compare_at_price: compare_at_price !== undefined ? compare_at_price : variant.compare_at_price,
      barcode: barcode !== undefined ? barcode : variant.barcode,
      weight: weight !== undefined ? weight : variant.weight,
      weight_unit: weight_unit || variant.weight_unit,
      requires_shipping: requires_shipping !== undefined ? requires_shipping : variant.requires_shipping,
      is_taxable: is_taxable !== undefined ? is_taxable : variant.is_taxable,
      is_active: is_active !== undefined ? is_active : variant.is_active,
      images: variantImages
    }, { transaction });
    
    // Update attributes if provided
    if (attributes) {
      // Parse attributes if they came as a string
      const attributesArray = typeof attributes === 'string' 
        ? JSON.parse(attributes) 
        : attributes;
      
      // Remove existing attribute associations
      await variant.setAttributes([], { transaction });
      
      // Add new attribute associations
      for (const attr of attributesArray) {
        // Find or create attribute
        const [attribute] = await Attribute.findOrCreate({
          where: { name: attr.name },
          defaults: {
            display_name: attr.display_name || attr.name,
            type: attr.type || 'string'
          },
          transaction
        });
        
        // Associate attribute with variant
        await variant.addAttribute(attribute, { 
          through: { value: attr.value },
          transaction 
        });
      }
    }
    
    // Update inventory if provided
    if (inventory) {
      // Parse inventory if it came as a string
      const inventoryArray = typeof inventory === 'string' 
        ? JSON.parse(inventory) 
        : inventory;
      
      for (const inv of inventoryArray) {
        // Check if inventory entry exists
        const inventoryRecord = await Inventory.findOne({
          where: {
            variant_id: variant.id,
            location_id: inv.location_id
          }
        });
        
        if (inventoryRecord) {
          // Update existing inventory
          await inventoryRecord.update({
            quantity: inv.quantity
          }, { transaction });
        } else {
          // Create new inventory entry
          // Check if location exists
          const location = await InventoryLocation.findByPk(inv.location_id, { transaction });
          
          if (!location) {
            await transaction.rollback();
            return res.status(400).json({
              success: false,
              message: `Inventory location with ID ${inv.location_id} not found`
            });
          }
          
          await Inventory.create({
            variant_id: variant.id,
            location_id: inv.location_id,
            quantity: inv.quantity || 0
          }, { transaction });
        }
      }
    }
    
    await transaction.commit();
    
    // Get updated variant with associations
    const updatedVariant = await ProductVariant.findByPk(variant.id, {
      include: [
        { model: Inventory, include: [InventoryLocation] },
        { model: Attribute, through: { attributes: ['value'] } }
      ]
    });
    
    return res.status(200).json({
      success: true,
      message: "Variant updated successfully",
      data: updatedVariant
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating variant:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to update variant",
      error: error.message
    });
  }
};

// Delete a variant
exports.deleteVariant = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const variantId = req.params.id;
    
    // Find variant to delete
    const variant = await ProductVariant.findByPk(variantId);
    
    if (!variant) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Variant not found"
      });
    }
    
    // Delete variant and associated data (inventory, etc.)
    await variant.destroy({ transaction });
    
    await transaction.commit();
    
    return res.status(200).json({
      success: true,
      message: "Variant deleted successfully"
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting variant:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to delete variant",
      error: error.message
    });
  }
};