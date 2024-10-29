const db = require("../dbConfig/dbConfig.js");
const Layout = db.layouts;
const Campaign = db.campaigns;
const { Op } = require("sequelize");

// Pagination helper function
const getPagination = (page, size) => {
  const limit = size ? +size : 10;
  const offset = page ? page * limit : 0;
  return { limit, offset };
};

// Create a new layout
const createLayout = async (req, res) => {
  try {
    const campaignID = req.params.campaignID;
    // Destructure required fields from request body
    const { name, layoutJSON } = req.body;

    // Validate required fields
    if (!name || !layoutJSON) {
      return res.status(400).json({
        message: "Missing required fields.",
      });
    }
    if (!campaignID) {
      return res.status(400).json({
        message: "Missing campaignId",
      });
    }

    // Validate data types
    if (typeof name !== "string") {
      return res
        .status(400)
        .json({ message: "Invalid data types for required fields." });
    }
    // First check if the campaign exists
    const campaign = await db.campaigns.findByPk(campaignID);
    if (!campaign) {
      return res.status(404).json({
        status: false,
        message: `Campaign with ID ${campaignID} not found`,
      });
    }

    // Prepare campaign data
    const layoutData = {
      name,
      layoutJSON,
      campaignID: campaignID,
    };

    // Create campaign
    const layout = await Layout.create(layoutData);

    return res.status(201).json({
      status: true,
      message: "Layout created successfully",
      data: layout,
    });
  } catch (error) {
    console.error("Error creating campaign:", error);
    // Handle other types of errors
    res
      .status(500)
      .json({ message: "Failed to create campaign", error: error.message });
  }
};

// Get all layouts with pagination
const getAllLayout = async (req, res) => {
  const { page, size, name } = req.query;
  const { limit, offset } = getPagination(page, size);

  // Get the campaignID from request parameters
  const campaignID = req.params.campaignID;

  // Create a condition to filter by campaignID and optionally by name
  const condition = {
    ...(name ? { name: { [Op.iLike]: `%${name}%` } } : {}),
    ...(campaignID ? { campaignID: campaignID } : {}), // Include campaignID in the condition
  };

  try {
    const data = await Layout.findAndCountAll({
      where: condition,
      limit,
      offset,
      include: [{ model: Campaign, as: "campaign" }],
    });

    res.json({
      success: true,
      totalItems: data.count,
      layouts: data.rows,
      currentPage: page ? +page : 0,
      totalPages: Math.ceil(data.count / limit),
    });
  } catch (error) {
    console.error("Error fetching layouts:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching layouts",
      error: error.message,
    });
  }
};

// Get a single layout by ID
const getOneLayout = async (req, res) => {
  try {
    const layout = await Layout.findByPk(req.params.id, {
      include: [{ model: Campaign, as: "campaign" }],
    });
    if (layout) {
      res.status(200).json({ success: true, data: layout });
    } else {
      res.status(404).json({ success: false, message: "Layout not found" });
    }
  } catch (error) {
    console.error("Error fetching layout:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching layout",
      error: error.message,
    });
  }
};

// Update a layout
const updateLayout = async (req, res) => {
  try {
    const [updated] = await Layout.update(req.body, {
      where: { layoutID: req.params.id },
    });
    if (updated) {
      const updatedLayout = await Layout.findByPk(req.params.id);
      res.json({
        status: true,
        message: "updated successfully",
        data: updatedLayout,
      });
    } else {
      res.status(404).json({ message: "Layout not found" });
    }
  } catch (error) {
    console.error("Error updating layout:", error);
    res
      .status(400)
      .json({ message: "Failed to update layout", error: error.message });
  }
};

// Delete a layout
const deleteLayout = async (req, res) => {
  try {
    const deleted = await Layout.destroy({
      where: { layoutID: req.params.id },
    });
    if (deleted) {
      res
        .status(200)
        .json({ status: true, message: "layout deleted successfully" });
    } else {
      res.status(404).json({ message: "Layout not found" });
    }
  } catch (error) {
    console.error("Error deleting layout:", error);
    res
      .status(500)
      .json({ message: "Failed to delete layout", error: error.message });
  }
};
module.exports = {
  createLayout,
  getAllLayout,
  getOneLayout,
  updateLayout,
  deleteLayout,
};
