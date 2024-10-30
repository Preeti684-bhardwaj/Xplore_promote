const db = require("../dbConfig/dbConfig.js");
const { uploadFiles ,deleteFile} = require("./cdnController.js");
const Campaign = db.campaigns;
const Layout = db.layouts;
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
  let uploadedUrls = [];
  
  try {
    // Validate basic request
    if (!req.body.data) {
      return res.status(400).json({
        success: false,
        message: "Missing required data"
      });
    }

    let data;
    try {
      data = JSON.parse(req.body.data);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON data format"
      });
    }

    // Validate required fields
    const { name, description, timing, status, performance, socialMediaLinks, contactInfo, siteInfo } = data;
    const requiredFields = { name, timing, status};
    
    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Handle file upload if files exist
    if (req.files && req.files.length > 0) {
      try {
        uploadedUrls = await uploadFiles(req.files);
        console.log('Files uploaded successfully:', uploadedUrls);
      } catch (uploadError) {
        console.error('File upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: "File upload failed",
          error: uploadError.message
        });
      }
    }

    // Prepare campaign data
    const campaignData = {
      name,
      description,
      timing,
      status,
      performance,
      socialMediaLinks,
      contactInfo,
      siteInfo,
      images: uploadedUrls, // Array of uploaded file information
      createdDate: new Date(),
      lastModifiedBy: req.user.id,
      lastModifiedDate: new Date(),
      createdBy: req.user.id
    };

    // Create campaign
    const campaign = await Campaign.create(campaignData);

    return res.status(201).json({
      success: true,
      message: "Campaign created successfully",
      data: campaign
    });

  } catch (error) {
    console.error("Campaign creation error:", error);
    
    // Clean up uploaded files if campaign creation fails
    if (uploadedUrls.length > 0) {
      try {
        await Promise.all(
          uploadedUrls.map(url => deleteFile(url.filename))
        );
      } catch (cleanupError) {
        console.error("Cleanup error:", cleanupError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create campaign",
      error: error.message
    });
  }
};

// Get all campaigns with pagination
const getAllCampaign = async (req, res) => {
  const { page, size, name } = req.query;
  const { limit, offset } = getPagination(page, size);

  // Modify condition to filter campaigns by authenticated user
  const condition = {
    createdBy: req.user.id, // Filter by the user ID from req.user
    ...(name ? { name: { [Op.iLike]: `%${name}%` } } : {}) // Include name filter if present
  };

  try {
    const data = await Campaign.findAndCountAll({
      where: condition,
      limit,
      offset,
      include: [
        { model: Layout, as: 'layouts' },
        {
          model: User,
          as: 'creator',
          attributes: [
            'id',
            'name',
            'email',
            'phone',
            'isEmailVerified',
            'appleUserId',
            'googleUserId',
            'authProvider',
          ],
        },
      ],
    });

    res.json({
      success:true,
      totalItems: data.count,
      campaigns: data.rows,
      currentPage: page ? +page : 0,
      totalPages: Math.ceil(data.count / limit),
    });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ success:false,message: 'Error fetching campaigns', error: error.message });
  }
};

// Get a single campaign by ID
const getOneCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      where: {
        campaignID: req.params.id,
        createdBy: req.user.id // Check if the campaign was created by the authenticated user
      },
      include: [
        { model: Layout, as: 'layouts' },
        {
          model: User,
          as: 'creator',
          attributes: [
            'id',
            'name',
            'email',
            'phone',
            'isEmailVerified',
            'appleUserId',
            'googleUserId',
            'authProvider',
          ],
        },
      ],
    });

    if (campaign) {
      res.status(200).json({success:true,data:campaign});
    } else {
      res.status(404).json({success:false, message: 'Campaign not found or access denied' });
    }
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({success:false, message: 'Error fetching campaign', error: error.message });
  }
};

// Update a campaign
const updateCampaign = async (req, res) => {
  let uploadedUrls = [];
  
  try {
    // Fetch the existing campaign to preserve the current values
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign) {
      return res.status(404).json({success:false, message: "Campaign not found" });
    }

    // Start with the existing data
    const updateData = {
      lastModifiedBy: req.user.id,
      lastModifiedDate: new Date(),
    };

    // Handle file uploads if present
    if (req.files && req.files.length > 0) {
      try {
        // Upload new files
        uploadedUrls = await uploadFiles(req.files);
        console.log('New files uploaded:', uploadedUrls);
        
        // Combine existing images with new uploads
        updateData.images = [...(campaign.images || []), ...uploadedUrls];
      } catch (uploadError) {
        console.error('File upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: "File upload failed",
          error: uploadError.message
        });
      }
    }

    // Parse and handle JSON data if present
    if (req.body.data) {
      let bodyData;
      try {
        bodyData = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid JSON data format"
        });
      }

      // Check and merge each field in bodyData
      if (bodyData.timing) {
        updateData.timing = { ...campaign.timing, ...bodyData.timing };
      }

      if (bodyData.status) {
        updateData.status = { ...campaign.status, ...bodyData.status };
      }

      if (bodyData.performance) {
        updateData.performance = { ...campaign.performance, ...bodyData.performance };
      }

      if (bodyData.socialMediaLinks) {
        updateData.socialMediaLinks = { ...campaign.socialMediaLinks, ...bodyData.socialMediaLinks };
      }

      if (bodyData.contactInfo) {
        updateData.contactInfo = { ...campaign.contactInfo, ...bodyData.contactInfo };
      }

      if (bodyData.siteInfo) {
        updateData.siteInfo = { ...campaign.siteInfo, ...bodyData.siteInfo };
      }

      // Handle image deletion if specified
      if (bodyData.imagesToDelete && Array.isArray(bodyData.imagesToDelete)) {
        try {
          // Delete specified images from storage
          await Promise.all(
            bodyData.imagesToDelete.map(filename => deleteFile(filename))
          );

          // Remove deleted images from the images array
          const currentImages = updateData.images || campaign.images || [];
          updateData.images = currentImages.filter(
            img => !bodyData.imagesToDelete.includes(img.filename)
          );
        } catch (deleteError) {
          console.error('Error deleting images:', deleteError);
          // Continue with update even if image deletion fails
        }
      }
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
      // Fetch the updated campaign with associations
      const updatedCampaign = await Campaign.findByPk(req.params.id, {
        include: [
          { model: Layout, as: "layouts" },
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
        success:true,
        message: "Campaign updated successfully",
        data: updatedCampaign,
      });
    }

    return res.status(400).json({success:false, message: "Failed to update campaign" });

  } catch (error) {
    console.error("Error updating campaign:", error);
    
    // Clean up any newly uploaded files if the update fails
    if (uploadedUrls.length > 0) {
      try {
        await Promise.all(
          uploadedUrls.map(file => deleteFile(file.filename))
        );
      } catch (cleanupError) {
        console.error("Cleanup error:", cleanupError);
      }
    }

    res.status(400).json({
      success:false, 
      message: "Failed to update campaign", 
      error: error.message 
    });
  }
};

// Delete a campaign
const deleteCampaign = async (req, res) => {
  try {
    const deleted = await Campaign.destroy({
      where: { campaignID: req.params.id },
    });
    if (deleted) {
      res
        .status(200)
        .json({ success: true, message: "Campaign deleted successfully" });
    } else {
      res.status(404).json({ success:false,message: "Campaign not found" });
    }
  } catch (error) {
    console.error("Error deleting campaign:", error);
    res
      .status(500)
      .json({success:false, message: "Failed to delete campaign", error: error.message });
  }
};

module.exports = {
  createCampaign,
  getAllCampaign,
  getOneCampaign,
  updateCampaign,
  deleteCampaign,
};
