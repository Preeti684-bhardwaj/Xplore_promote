const db = require("../dbConfig/dbConfig.js");
const Campaign = db.campaigns;
const Advertisement = db.advertisements;
const User = db.users;
const { Op } = require("sequelize");
const { ValidationError } = require("sequelize");

// Pagination helper function
const getPagination = (page, size) => {
  const limit = size ? +size : 10;
  const offset = page ? page * limit : 0;
  return { limit, offset };
};

// Create a new campaign
const createCampaign = async (req, res) => {
  try {
    // Destructure required fields from request body
    const { name, description, timing, status, performance, ...otherFields } =
      req.body;

    // Validate required fields
    if (!name || !description || !timing || !status || !performance) {
      return res.status(400).json({
        message:
          "Missing required fields. Name, description, timing, status, and performance are mandatory.",
      });
    }

    // Validate data types
    if (
      typeof name !== "string" ||
      typeof description !== "string" ||
      typeof timing !== "object" ||
      typeof status !== "object" ||
      typeof performance !== "object"
    ) {
      return res
        .status(400)
        .json({ message: "Invalid data types for required fields." });
    }

    // Prepare campaign data
    const campaignData = {
      name,
      description,
      timing,
      status,
      performance,
      ...otherFields,
      createdDate: new Date(),
      createdBy: req.user.id,
      lastModifiedBy: req.user.id,
      lastModifiedDate: new Date(),
    };

    // Create campaign
    const campaign = await Campaign.create(campaignData);

    res.status(201).json(campaign);
  } catch (error) {
    console.error("Error creating campaign:", error);

    if (error instanceof ValidationError) {
      // Handle Sequelize validation errors
      return res.status(400).json({
        message: "Validation error",
        errors: error.errors.map((e) => ({
          field: e.path,
          message: e.message,
        })),
      });
    }

    // Handle other types of errors
    res
      .status(500)
      .json({ message: "Failed to create campaign", error: error.message });
  }
};
// Get all campaigns with pagination
const getAllCampaign = async (req, res) => {
  const { page, size, name } = req.query;
  const { limit, offset } = getPagination(page, size);
  const condition = name ? { name: { [Op.iLike]: `%${name}%` } } : null;

  try {
    const data = await Campaign.findAndCountAll({
      where: condition,
      limit,
      offset,
      include: [
        { model: Advertisement, as: "advertisements" },
        {
          model: User,
          as: "creator",
          attributes: [
            "id",
            "name",
            "email",
            "phone",
            "isEmailVerified",
            "appleUserId",
            "googleUserId",
            "authProvider",
          ],
        },
      ],
    });

    res.json({
      totalItems: data.count,
      campaigns: data.rows,
      currentPage: page ? +page : 0,
      totalPages: Math.ceil(data.count / limit),
    });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    res
      .status(500)
      .json({ message: "Error fetching campaigns", error: error.message });
  }
};

// Get a single campaign by ID
const getOneCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id, {
      include: [
        { model: Advertisement, as: "advertisements" },
        {
          model: User,
          as: "creator",
          attributes: [
            "id",
            "name",
            "email",
            "phone",
            "isEmailVerified",
            "appleUserId",
            "googleUserId",
            "authProvider",
          ],
        },
      ],
    });
    if (campaign) {
      res.json(campaign);
    } else {
      res.status(404).json({ message: "Campaign not found" });
    }
  } catch (error) {
    console.error("Error fetching campaign:", error);
    res
      .status(500)
      .json({ message: "Error fetching campaign", error: error.message });
  }
};

// Update a campaign
const updateCampaign = async (req, res) => {
    try {
      // Fetch the existing campaign to preserve the current values
      const campaign = await Campaign.findByPk(req.params.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
  
      // Start with the existing data
      const updateData = {
        lastModifiedBy: req.user.id,
        lastModifiedDate: new Date(),
      };
  
      // Check each field in req.body and update only the provided keys
      if (req.body.timing) {
        updateData.timing = { ...campaign.timing, ...req.body.timing }; // Merge incoming timing data with existing
      }
  
      if (req.body.status) {
        updateData.status = { ...campaign.status, ...req.body.status }; // Merge incoming status data with existing
      }
  
      if (req.body.performance) {
        updateData.performance = { ...campaign.performance, ...req.body.performance }; // Merge performance data
      }
  
      if (req.body.socialMediaLinks) {
        updateData.socialMediaLinks = { ...campaign.socialMediaLinks, ...req.body.socialMediaLinks }; // Merge social media links
      }
  
      if (req.body.contactInfo) {
        updateData.contactInfo = { ...campaign.contactInfo, ...req.body.contactInfo }; // Merge contact info
      }
  
      if (req.body.siteInfo) {
        updateData.siteInfo = { ...campaign.siteInfo, ...req.body.siteInfo }; // Merge site info
      }
  
      // Ensure that createdBy and campaignID are not modified
      delete updateData.createdBy;
      delete updateData.campaignID;
  
      // Perform the update, passing only the modified fields
      const [updated] = await Campaign.update(updateData, {
        where: { campaignID: req.params.id },
        returning: true,
      });
  
      if (updated) {
        // Fetch the updated campaign
        const updatedCampaign = await Campaign.findByPk(req.params.id, {
          include: [
            { model: Advertisement, as: "advertisements" },
            {
              model: User,
              as: "creator",
              attributes: [
                "id",
                "name",
                "email",
                "phone",
                "isEmailVerified",
                "appleUserId",
                "googleUserId",
                "authProvider",
              ],
            },
          ],
        });
  
        return res.json({
          message: "Campaign updated successfully",
          data: updatedCampaign,
        });
      }
  
      return res.status(400).json({ message: "Failed to update campaign" });
    } catch (error) {
      console.error("Error updating campaign:", error);
      res
        .status(400)
        .json({ message: "Failed to update campaign", error: error.message });
    }
  };
// Delete a campaign
const deleteCampaign = async (req, res) => {
  try {
    const deleted = await Campaign.destroy({
      where: { campaignID: req.params.id },
    });
    if (deleted) {
      res.status(200).json({status:true,message:"Campaign deleted successfully"});
    } else {
      res.status(404).json({ message: "Campaign not found" });
    }
  } catch (error) {
    console.error("Error deleting campaign:", error);
    res
      .status(500)
      .json({ message: "Failed to delete campaign", error: error.message });
  }
};

module.exports = {
  createCampaign,
  getAllCampaign,
  getOneCampaign,
  updateCampaign,
  deleteCampaign,
};
