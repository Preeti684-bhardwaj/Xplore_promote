const db = require("../dbConfig/db.js");
const Inventory = db.Inventory;
const InventoryLocation = db.InventoryLocation;
const ProductVariant = db.ProductVariant;

// ----- Inventory Location APIs -----

// Create a new inventory location
exports.createLocation = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { name, address, is_active } = req.body;
    
    // Validate required fields
    if (!name) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Location name is required"
      });
    }
    
    // Create location record
    const newLocation = await InventoryLocation.create({
      name,
      address,
      is_active: is_active !== undefined ? is_active : true
    }, { transaction });
    
    await transaction.commit();
    
    return res.status(201).json({
      success: true,
      message: "Inventory location created successfully",
      data: newLocation
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating inventory location:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to create inventory location",
      error: error.message
    });
  }
};

// Get all inventory locations
exports.getAllLocations = async (req, res) => {
  try {
    const locations = await InventoryLocation.findAll({
      order: [['name', 'ASC']]
    });
    
    return res.status(200).json({
      success: true,
      message: "Inventory locations retrieved successfully",
      data: locations
    });
  } catch (error) {
    console.error("Error retrieving inventory locations:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve inventory locations",
      error: error.message
    });
  }
};

// Get a single inventory location
exports.getOneLocation = async (req, res) => {
  try {
    const locationId = req.params.id;
    
    const location = await InventoryLocation.findByPk(locationId, {
      include: [
        { 
          model: Inventory,
          include: [
            { 
              model: ProductVariant,
              include: [db.Product]
            }
          ]
        }
      ]
    });
    
    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Inventory location not found"
      });
    }
    
    return res.status(200).json({
      success: true,
      message: "Inventory location retrieved successfully",
      data: location
    });
  } catch (error) {
    console.error("Error retrieving inventory location:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve inventory location",
      error: error.message
    });
  }
};

// Update an inventory location
exports.updateLocation = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const locationId = req.params.id;
    const { name, address, is_active } = req.body;
    
    // Find location to update
    const location = await InventoryLocation.findByPk(locationId);
    
    if (!location) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Inventory location not found"
      });
    }
    
    // Update location
    await location.update({
      name: name || location.name,
      address: address !== undefined ? address : location.address,
      is_active: is_active !== undefined ? is_active : location.is_active
    }, { transaction });
    
    await transaction.commit();
    
    return res.status(200).json({
      success: true,
      message: "Inventory location updated successfully",
      data: location
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating inventory location:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to update inventory location",
      error: error.message
    });
  }
};

// Delete an inventory location
exports.deleteLocation = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const locationId = req.params.id;
    
    // Check if location has inventory
    const inventoryCount = await Inventory.count({
      where: { location_id: locationId }
    });
    
    if (inventoryCount > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot delete location with existing inventory. Please remove inventory first."
      });
    }
    
    // Find location to delete
    const location = await InventoryLocation.findByPk(locationId);
    
    if (!location) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Inventory location not found"
      });
    }
    
    // Delete location
    await location.destroy({ transaction });
    
    await transaction.commit();
    
    return res.status(200).json({
      success: true,
      message: "Inventory location deleted successfully"
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting inventory location:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to delete inventory location",
      error: error.message
    });
  }
};

// ----- Inventory APIs -----

// Create inventory record
exports.createInventory = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { variant_id, location_id, quantity } = req.body;
    
    // Validate required fields
    if (!variant_id || !location_id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Variant ID and location ID are required"
      });
    }
    
    // Check if variant exists
    const variant = await ProductVariant.findByPk(variant_id);
    if (!variant) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Product variant not found"
      });
    }
    
    // Check if location exists
    const location = await InventoryLocation.findByPk(location_id);
    if (!location) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Inventory location not found"
      });
    }
    
    // Check if inventory record already exists
    const existingInventory = await Inventory.findOne({
      where: {
        variant_id,
        location_id
      }
    });
    
    if (existingInventory) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Inventory record already exists for this variant and location. Use update instead."
      });
    }
    
    // Create inventory record
    const newInventory = await Inventory.create({
      variant_id,
      location_id,
      quantity: quantity || 0
    }, { transaction });
    
    await transaction.commit();
    
    // Get complete inventory with associations
    const completeInventory = await Inventory.findByPk(newInventory.id, {
      include: [
        InventoryLocation,
        { model: ProductVariant, include: [db.Product] }
      ]
    });
    
    return res.status(201).json({
      success: true,
      message: "Inventory created successfully",
      data: completeInventory
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating inventory:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to create inventory",
      error: error.message
    });
  }
};

// Get all inventory records
exports.getAllInventory = async (req, res) => {
  try {
    // Extract query parameters
    const { variant_id, location_id, low_stock } = req.query;
    
    // Build query conditions
    const where = {};
    
    if (variant_id) {
      where.variant_id = variant_id;
    }
    
    if (location_id) {
      where.location_id = location_id;
    }
    
    // For low stock query (quantity less than specified value)
    if (low_stock) {
      where.quantity = { [db.Sequelize.Op.lt]: parseInt(low_stock) };
    }
    
    // Get inventory records
    const inventory = await Inventory.findAll({
      where,
      include: [
        InventoryLocation,
        { 
          model: ProductVariant,
          include: [db.Product]
        }
      ],
      order: [['updatedAt', 'DESC']]
    });
    
    return res.status(200).json({
      success: true,
      message: "Inventory retrieved successfully",
      data: inventory
    });
  } catch (error) {
    console.error("Error retrieving inventory:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve inventory",
      error: error.message
    });
  }
};

// Get a single inventory record
exports.getOneInventory = async (req, res) => {
  try {
    const inventoryId = req.params.id;
    
    const inventory = await Inventory.findByPk(inventoryId, {
      include: [
        InventoryLocation,
        { 
          model: ProductVariant,
          include: [db.Product]
        }
      ]
    });
    
    if (!inventory) {
      return res.status(404).json({
        success: false,
        message: "Inventory record not found"
      });
    }
    
    return res.status(200).json({
      success: true,
      message: "Inventory record retrieved successfully",
      data: inventory
    });
  } catch (error) {
    console.error("Error retrieving inventory record:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve inventory record",
      error: error.message
    });
  }
};

// Update an inventory record
exports.updateInventory = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const inventoryId = req.params.id;
    const { quantity } = req.body;
    
    // Find inventory to update
    const inventory = await Inventory.findByPk(inventoryId);
    
    if (!inventory) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Inventory record not found"
      });
    }
    
    // Update inventory
    await inventory.update({
      quantity: quantity !== undefined ? quantity : inventory.quantity
    }, { transaction });
    
    await transaction.commit();
    
    // Get updated inventory with associations
    const updatedInventory = await Inventory.findByPk(inventoryId, {
      include: [
        InventoryLocation,
        { model: ProductVariant, include: [db.Product] }
      ]
    });
    
    return res.status(200).json({
      success: true,
      message: "Inventory updated successfully",
      data: updatedInventory
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating inventory:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to update inventory",
      error: error.message
    });
  }
};

exports.deleteInventory = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    
    try {
      const inventoryId = req.params.id;
      
      // Find inventory to delete
      const inventory = await Inventory.findByPk(inventoryId);
      
      if (!inventory) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "Inventory record not found"
        });
      }
      
      // Delete inventory
      await inventory.destroy({ transaction });
      
      await transaction.commit();
      
      return res.status(200).json({
        success: true,
        message: "Inventory record deleted successfully"
      });
    }  catch (error) {
        await transaction.rollback();
        console.error("Error delete inventory:", error);
        
        return res.status(500).json({
          success: false,
          message: "Failed to delete inventory",
          error: error.message
        });
      }
    };