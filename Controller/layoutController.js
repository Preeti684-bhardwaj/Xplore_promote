const db = require("../dbConfig/dbConfig.js");
const Layout = db.layouts;
const Campaign = db.campaigns;
const { Op } = require("sequelize");
const { getPagination } = require("../validators/campaignValidations.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

// Create a new layout
const createLayout = asyncHandler(async (req, res, next) => {
  try {
    const campaignID = req.params?.campaignID;
    // Destructure required fields from request body
    const { name, layoutJSON } = req.body;

    // Validate required fields
    if (!name || !layoutJSON) {
      return next(new ErrorHandler("Missing required fields.", 400));
    }
    if (!campaignID) {
      return next(new ErrorHandler("Missing campaignId", 400));
    }

    // Validate data types
    if (typeof name !== "string") {
      return next(
        new ErrorHandler("Invalid data types for required fields.", 400)
      );
    }

    // First check if the campaign exists
    const campaign = await Campaign.findByPk(campaignID);
    if (!campaign) {
      return next(
        new ErrorHandler(`Campaign with ID ${campaignID} not found`, 404)
      );
    }
    if (campaign.createdBy !== req.user.id) {
      return next(new ErrorHandler("Unauthorized access", 403));
    }

    // Check for existing layouts with the same name for the same campaign
    const existingLayout = await Layout.findOne({
      where: { name, campaignID }, // Ensure uniqueness within the same campaign
    });
    if (existingLayout) {
      return next(
        new ErrorHandler(`${name} already exists for this campaign.`, 400)
      );
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
    return next(
      new ErrorHandler("Failed to create campaign" || error.message, 500)
    );
  }
});

// Get all layouts with pagination
const getAllLayout = asyncHandler(async (req, res, next) => {
  const { page = 0, size = 10 } = req.query; // Default values: page 0, size 10
  const { limit, offset } = getPagination(page, size);

  // Get the campaignID from request parameters
  const campaignID = req.params?.campaignID;
  if (!campaignID) {
    return next(new ErrorHandler("Missing Campaign Id", 400));
  }
  // Create a condition to filter by campaignID and optionally by name
  const condition = {
    campaignID: campaignID, // Include campaignID in the condition
  };

  try {
    const data = await Layout.findAndCountAll({
      where: condition,
      limit,
      offset,
      include: [
        { model: Campaign, as: "campaign", attributes: ["campaignID"] },
      ],
      order: [["createdAt", "ASC"]],
    });
    if (!data) {
      return next(new ErrorHandler("Campaign Not found", 404));
    }

    return res.status(200).json({
      success: true,
      totalItems: data.count,
      layouts: data.rows,
      currentPage: page ? +page : 0,
      totalPages: Math.ceil(data.count / limit),
    });
  } catch (error) {
    console.error("Error fetching layouts:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get a single layout by ID
const getOneLayout = asyncHandler(async (req, res, next) => {
  try {
    if (!req.params?.id) {
      return next(new ErrorHandler("Missing Layout Id", 400));
    }
    const layout = await Layout.findByPk(req.params.id, {
      include: [
        { model: Campaign, as: "campaign", attributes: ["campaignID"] },
      ],
    });
    if (layout) {
      return res.status(200).json({ success: true, data: layout });
    } else {
      return next(new ErrorHandler("Layout not found", 404));
    }
  } catch (error) {
    console.error("Error fetching layout:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

// Update a layout
const updateLayout = asyncHandler(async (req, res, next) => {
  try {
    if (!req.params?.id) {
      return next(new ErrorHandler("Missing Layout Id", 400));
    }
    const layout = await Layout.findByPk(req.params.id);
    const campaignID = layout.campaignID;

    // First check if the campaign exists
    const campaign = await Campaign.findByPk(campaignID);
    if (!campaign) {
      return next(
        new ErrorHandler(`Campaign with ID ${campaignID} not found`, 404)
      );
    }
    if (campaign.createdBy !== req.user.id) {
      return next(new ErrorHandler("Unauthorized access", 403));
    }

    const [updated] = await Layout.update(req.body, {
      where: { layoutID: req.params.id },
    });
    if (updated) {
      const updatedLayout = await Layout.findByPk(req.params.id);
      return res.status(200).json({
        status: true,
        message: "updated successfully",
        data: updatedLayout,
      });
    } else {
      return next(new ErrorHandler("Layout not found", 404));
    }
  } catch (error) {
    console.error("Error updating layout:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

// Delete a layout
const deleteLayout = asyncHandler(async (req, res, next) => {
  try {
    if (!req.params?.id) {
      return next(new ErrorHandler("Missing Layout Id", 400));
    }
    const deleted = await Layout.destroy({
      where: { layoutID: req.params.id },
    });
    if (deleted) {
      return res
        .status(200)
        .json({ status: true, message: "layout deleted successfully" });
    } else {
      return next(new ErrorHandler("Layout not found", 404));
    }
  } catch (error) {
    console.error("Error deleting layout:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = {
  createLayout,
  getAllLayout,
  getOneLayout,
  updateLayout,
  deleteLayout,
};
