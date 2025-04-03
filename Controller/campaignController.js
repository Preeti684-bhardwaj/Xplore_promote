const db = require("../dbConfig/dbConfig.js");
const Campaign = db.campaigns;
const Layout = db.layouts;
const { Op } = require("sequelize");
const User = db.users;
const CampaignEndUser = db.sequelize.model("CampaignEndUser");
const { uploadFiles, deleteFile } = require("../utils/cdnImplementation.js");
const {
  validateFiles,
  getPagination,
} = require("../validators/campaignValidations.js");
const {
  getCampaignStatus,
  validateTiming,
} = require("../utils/campaignStatusManager.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");
const shortId = require("shortid");
const jwt = require("jsonwebtoken");


const checkCampaignAccess = async (campaignId, userId) => {
  // Check if the user created the campaign
  const ownedCampaign = await Campaign.findOne({
    where: {
      campaignID: campaignId,
      createdBy: userId
    }
  });
  
  if (ownedCampaign) return true;
  
  // Check if the user has an association with the campaign
  const association = await CampaignEndUser.findOne({
    where: {
      campaignID: campaignId,
      userID: userId
    }
  });
  
  return !!association;
};

//--------------------Campaign operations----------------------------------
const createCampaign = asyncHandler(async (req, res, next) => {
  let uploadedUrls = [];

  try {
    // Validate file requirements first
    const fileError = validateFiles(req.files);
    if (fileError) {
      return next(new ErrorHandler(fileError, 400));
    }
    // Parse and validate request data
    let data;
    try {
      data =
        typeof req.body?.data === "string"
          ? JSON.parse(req.body?.data)
          : req.body?.data;
      console.log(data);
    } catch (error) {
      return next(new ErrorHandler("Invalid JSON data format", 400));
    }
    // Validate basic request
    if (!data) {
      return next(new ErrorHandler("Missing required data", 400));
    }
    // Validate timing data
    const timingErrors = validateTiming(data.timing);
    if (timingErrors.length > 0) {
      return next(new ErrorHandler(timingErrors.join(", "), 400));
    }

    // Calculate initial campaign status
    const campaignStatus = getCampaignStatus(
      data.timing.startDate,
      data.timing.endDate,
      data.timing.timeZone
    );

    // Validate required fields
    const {
      name,
      description,
      timing,
      status,
      performance,
      socialMediaLinks,
      contactInfo,
      siteInfo,
    } = data;

    const missingFields = [];

    // Check for empty or missing `name`
    if (!name || typeof name !== "string" || name.trim() === "") {
      missingFields.push("name");
    }
    // Validate `timing` field structure and required nested fields
    if (
      !timing ||
      typeof timing !== "object" ||
      !timing.startDate ||
      !timing.endDate
    ) {
      missingFields.push("timing (must include startDate, endDate)");
    }

    // Validate `status` field structure and required nested fields
    if (
      !status ||
      typeof status !== "object" ||
      !status.status ||
      !status.approvalStatus
    ) {
      missingFields.push("status (must include status and approvalStatus)");
    }
    // Return error if any required fields are missing
    if (missingFields.length > 0) {
      return next(
        new ErrorHandler(
          `Missing required fields: ${missingFields.join(", ")}`,
          400
        )
      );
    }
    // Handle file upload
    try {
      uploadedUrls = await uploadFiles(req.files);
      console.log("Files uploaded successfully:", uploadedUrls);

      // Validate uploaded files results
      if (uploadedUrls.length === 0) {
        return next(
          new ErrorHandler("File upload failed - no files were processed", 400)
        );
      }
    } catch (uploadError) {
      console.error("File upload error:", uploadError);
      return next(
        new ErrorHandler(`File upload failed: ${uploadError.message}`, 500)
      );
    }

    // Define a new character set without special characters
    const customChars =
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$#";
    shortId.characters(customChars);

    // Generate short code
    let shortCode = shortId.generate().toLowerCase();

    // Ensure unique short code
    const existingCode = await Campaign.findOne({
      where: {
        shortCode: shortCode,
      },
    });

    if (existingCode) {
      shortCode = shortId.generate().toLowerCase();
    }
    // Create short URL
    const shortUrl = `https://xplr.live/${shortCode}`;
    // Prepare campaign data
    const campaignData = {
      name: data.name,
      description: data.description?.trim() || null,
      timing: data.timing,
      status: data.status,
      campaignStatus, // Add the calculated status
      performance:
        performance && typeof performance === "object" ? performance : null,
      socialMediaLinks:
        socialMediaLinks && typeof socialMediaLinks === "object"
          ? socialMediaLinks
          : null,
      contactInfo:
        contactInfo && typeof contactInfo === "object" ? contactInfo : null,
      siteInfo: siteInfo && typeof siteInfo === "object" ? siteInfo : null,
      images: uploadedUrls,
      createdDate: new Date(),
      lastModifiedDate: new Date(),
      createdBy: req.user.id,
      shortCode: shortCode,
      shortUrl: shortUrl,
      lastModifiedBy: req.user.id,
    };
    // Create campaign with transaction
    const campaign = await db.sequelize.transaction(async (t) => {
      const newCampaign = await Campaign.create(campaignData, {
        transaction: t,
      });
      return newCampaign;
    });

    return res.status(201).json({
      success: true,
      message: "Campaign created successfully",
      data: campaign,
    });
  } catch (error) {
    console.error("Campaign creation error:", error);
    // Clean up uploaded files if campaign creation fails
    if (uploadedUrls.length > 0) {
      try {
        await Promise.all(uploadedUrls.map((url) => deleteFile(url.filename)));
        console.log("Cleaned up uploaded files after error");
      } catch (cleanupError) {
        console.error("Cleanup error:", cleanupError);
      }
    }
    return next(new ErrorHandler(error.message, 500));
  }
});

//-------------------Get all campaigns with pagination---------------------------
const getAllCampaign = asyncHandler(async (req, res, next) => {
  try {
    const { page = 0, size = 10 } = req.query;
    const { limit, offset } = getPagination(page, size);
    const userID = req.user.id;

    // First, get all campaign IDs associated with the user
    const userCampaigns = await CampaignEndUser.findAll({
      where: { userID },
      attributes: ["campaignID"],
    });

    const sharedCampaignIDs = userCampaigns.map((uc) => uc.campaignID);

    // Now find all campaigns either created by user OR whose IDs are in the shared list
    const campaigns = await Campaign.findAndCountAll({
      where: {
        [Op.or]: [
          { createdBy: userID }, // Campaigns created by the user
          {
            campaignID: {
              [Op.in]: sharedCampaignIDs, // Campaigns shared with the user
            },
          },
        ],
      },
      limit,
      offset,
      include: [
        {
          model: Layout,
          as: "layouts",
          order: [["createdAt", "ASC"]],
        },
        {
          model: User,
          as: "users",
          attributes: ["id", "name", "email"],
          through: { attributes: [] }, // Don't include the junction table attributes
        },
      ],
      distinct: true, // Important for correct count with associations
      order: [["createdDate", "DESC"]],
    });

    // Update status for each campaign based on current time
    const updatedCampaigns = await Promise.all(
      campaigns.rows.map(async (campaign) => {
        const currentStatus = getCampaignStatus(
          campaign.timing.startDate,
          campaign.timing.endDate,
          campaign.timing.timeZone
        );

        // Update database if status has changed
        if (currentStatus !== campaign.campaignStatus) {
          await Campaign.update(
            { campaignStatus: currentStatus },
            { where: { campaignID: campaign.campaignID } }
          );
          campaign.campaignStatus = currentStatus;
        }

        // Add isOwner flag
        campaign.dataValues.isOwner = campaign.createdBy === userID;

        return campaign;
      })
    );

    return res.status(200).json({
      success: true,
      totalItems: campaigns.count,
      campaigns: updatedCampaigns,
      currentPage: page ? +page : 0,
      totalPages: Math.ceil(campaigns.count / limit),
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//-------------------Get a single campaign by ID---------------------------------------
const getOneCampaign = asyncHandler(async (req, res, next) => {
  try {
    if (!req.params?.id) {
      return next(new ErrorHandler("Missing Campaign Id", 400));
    }

    const userID = req.user?.id;
    const campaignID = req.params?.id;

    // Check if user has access to the campaign
    const hasAccess = await checkCampaignAccess(campaignID, userID);

    if (!hasAccess) {
      return next(
        new ErrorHandler(`Campaign not found or you don't have access`, 404)
      );
    }

    const campaign = await Campaign.findOne({
      where: {
        campaignID: campaignID,
      },
      include: [
        {
          model: db.layouts,
          as: "layouts",
          order: [["createdAt", "ASC"]],
        },
        {
          model: User,
          as: "users",
          attributes: ["id", "name", "email"],
          through: { attributes: [] }, // Don't include junction table attrs
        }
      ],
      order: [[{ model: db.layouts, as: "layouts" }, "createdAt", "ASC"]],
    });

    if (!campaign) {
      return next(new ErrorHandler(`Campaign not found`, 404));
    }

    // Add an isOwner flag to indicate if the user is the creator
    const isOwner = campaign.createdBy === userID;

    // Update campaign status based on current time
    const currentStatus = getCampaignStatus(
      campaign.timing.startDate,
      campaign.timing.endDate,
      campaign.timing.timeZone
    );

    if (currentStatus !== campaign.campaignStatus) {
      await Campaign.update(
        { campaignStatus: currentStatus },
        { where: { campaignID: campaign.campaignID } }
      );
      campaign.campaignStatus = currentStatus;
    }

    // Include isOwner flag in the response
    return res.status(200).json({
      success: true,
      data: {
        ...campaign.toJSON(),
        isOwner,
      },
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});
//------------------Update a campaign------------------------------------------------
const updateCampaign = asyncHandler(async (req, res, next) => {
  try {
    let uploadedUrls = [];
    const campaignId = req.params?.id;
    const userID = req.user?.id;

    if (!campaignId) {
      return next(new ErrorHandler("Missing campaign Id", 400));
    }

    const campaign = await Campaign.findByPk(campaignId, {
      transaction: await db.sequelize.transaction(),
    });

    if (!campaign) {
      return next(new ErrorHandler("Campaign not found", 404));
    }

    if (campaign.createdBy !== userID) {
      return next(
        new ErrorHandler(
          "Unauthorized - Only the campaign creator can update it",
          403
        )
      );
    }

    let updateData = {
      lastModifiedBy: req.user.id,
      lastModifiedDate: new Date(),
    };

    // Only handle file operations if files are present in the request
    if (req.files && req.files.length > 0) {
      if (req.files.length > 1) {
        return next(new ErrorHandler(`Maximum ${1} files allowed`, 400));
      }
      try {
        // Delete existing images first
//        if (campaign.images && campaign.images.length > 0) {
  //        await Promise.all(
    //        campaign.images.map((image) => deleteFile(image.filename))
      //    );
       // }

        // Upload new images and directly assign to updateData
        uploadedUrls.push(...(await uploadFiles(req.files)));
        updateData.images = uploadedUrls; // Replace instead of concatenate
      } catch (uploadError) {
        console.error("File upload error:", uploadError);
        return next(
          new ErrorHandler(`File upload failed: ${uploadError.message}`, 400)
        );
      }
    }

    if (req.body.data) {
      let bodyData;
      try {
        bodyData =
          typeof req.body.data === "string"
            ? JSON.parse(req.body.data)
            : req.body.data;
      } catch (error) {
        return next(new ErrorHandler("Invalid JSON data format", 400));
      }

      if (bodyData.name) {
        updateData.name = bodyData.name;
      }

      if (bodyData.description) {
        updateData.description = bodyData.description;
      }
      if (bodyData.timing) {
        const timingErrors = validateTiming(bodyData.timing);
        if (timingErrors.length > 0) {
          return next(new ErrorHandler(timingErrors.join(", "), 400));
        }

        updateData.timing = { ...campaign.timing, ...bodyData.timing };
        updateData.campaignStatus = getCampaignStatus(
          updateData.timing.startDate,
          updateData.timing.endDate,
          updateData.timing.timeZone
        );
      }
      if (bodyData.status) {
        updateData.status = { ...campaign.status, ...bodyData.status };
      }
      if (bodyData.performance) {
        updateData.performance = {
          ...campaign.performance,
          ...bodyData.performance,
        };
      }
      if (bodyData.socialMediaLinks) {
        updateData.socialMediaLinks = {
          ...campaign.socialMediaLinks,
          ...bodyData.socialMediaLinks,
        };
      }
      if (bodyData.contactInfo) {
        updateData.contactInfo = {
          ...campaign.contactInfo,
          ...bodyData.contactInfo,
        };
      }
      if (bodyData.siteInfo) {
        updateData.siteInfo = { ...campaign.siteInfo, ...bodyData.siteInfo };
      }

      if (bodyData.imagesToDelete && Array.isArray(bodyData.imagesToDelete)) {
        try {
          await Promise.all(
            bodyData.imagesToDelete.map((filename) => deleteFile(filename))
          );
          // Only update images array if we're specifically deleting images
          const currentImages = campaign.images || [];
          updateData.images = currentImages.filter(
            (img) => !bodyData.imagesToDelete.includes(img.filename)
          );
        } catch (deleteError) {
          console.error("Error deleting images:", deleteError);
          // Continue with the update even if image deletion fails
        }
      }
    }

    delete updateData.createdBy;
    delete updateData.campaignID;

    // Define a custom character set without special characters
    const customChars =
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$#";
    shortId.characters(customChars);
    // Handle shortCode and shortUrl generation
    let shortCode = campaign.shortCode;
    let shortUrl = campaign.shortUrl;

    // If shortCode or shortUrl doesn't exist, generate new ones
    if (!shortCode || !shortUrl) {
      // Generate a new unique shortCode
      const generateUniqueShortCode = async () => {
        let newShortCode = shortId.generate().toLowerCase();
        const existingUser = await Campaign.findOne({
          where: {
            [Op.or]: [
              { shortCode: newShortCode },
              { shortUrl: `https://xplr.live/${newShortCode}` },
            ],
          },
        });

        // If shortCode or shortUrl already exists, regenerate
        if (existingUser) {
          return generateUniqueShortCode();
        }

        return newShortCode;
      };

      shortCode = await generateUniqueShortCode();
      shortUrl = `https://xplr.live/${shortCode}`;

      updateData.shortCode = shortCode;
      updateData.shortUrl = shortUrl;
    }

    const [updated] = await Campaign.update(updateData, {
      where: { campaignID: req.params.id },
      returning: true,
    });

    if (updated) {
      const updatedCampaign = await Campaign.findByPk(req.params.id, {
        include: [
          {
            model: Layout,
            as: "layouts",
            attributes: ["layoutID"],
            order: [["createdAt", "ASC"]],
          },
          {
            model: User,
            as: "users",
            through: { where: { userID } },
          },
        ],
      });

      return res.status(200).json({
        success: true,
        message: "Campaign updated successfully",
        data: updatedCampaign,
      });
    }
  } catch (error) {
    console.error("Campaign updation error:", error);
    if (uploadedUrls.length > 0) {
      try {
        await Promise.all(uploadedUrls.map((url) => deleteFile(url.filename)));
        console.log("Cleaned up uploaded files after error");
      } catch (cleanupError) {
        console.error("Cleanup error:", cleanupError);
      }
    }
    return next(new ErrorHandler(error.message, 500));
  }
});

//----------------Delete a campaign---------------------------------------------
const deleteCampaign = asyncHandler(async (req, res, next) => {
  try {
    if (!req.params?.id) {
      return next(new ErrorHandler("Missing campaign Id", 400));
    }
    const campaign = await Campaign.findByPk(req.params?.id);

    if (!campaign) {
      return next(new ErrorHandler("Campaign not found", 404));
    }
    if (campaign.createdBy !== req.user.id) {
      return next(
        new ErrorHandler(
          "Unauthorized - Only the campaign creator can delete it",
          403
        )
      );
    }
    // Delete associated files first
    if (campaign.images?.length > 0) {
      await Promise.all(
        campaign.images.map((image) => deleteFile(image.filename))
      );
    }

    // Delete campaign with transaction
    await db.sequelize.transaction(async (t) => {
      // First delete all associated ContactUs records
      await db.contacts.destroy({
        where: { campaignId: req.params.id },
        transaction: t,
      });

      // Delete all sharing relationships in CampaignEndUser
      await CampaignEndUser.destroy({
        where: { campaignID: req.params.id },
        transaction: t,
      });

      // Then delete the campaign
      await Campaign.destroy({
        where: { campaignID: req.params.id },
        transaction: t,
      });
    });

    return res.status(200).json({
      success: true,
      message: "Campaign deleted successfully",
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//------------get all metadata of campaign-------------------------------------
const getAllCampaignMetadata = asyncHandler(async (req, res, next) => {
  try {
    // const { page, size, name, startDate, endDate, status } = req.query;
    const { page = 0, size = 10 } = req.query; // Default values: page 0, size 10
    const { limit, offset } = getPagination(page, size);
    // const userID = req.user.id;
    // Build filter conditions
    // const condition = {
    //   createdBy: req.user.id,
    //   // ...(name && { name: { [Op.iLike]: `%${name}%` } }),
    //   // ...(status && { status }),
    //   // ...(startDate && endDate && {
    //   //   createdDate: {
    //   //     [Op.between]: [new Date(startDate), new Date(endDate)]
    //   //   }
    //   // })
    // };

    const campaigns = await Campaign.findAndCountAll({
      // where: condition,
      limit,
      offset,
      attributes: ["campaignID", "name", "description", "images"],
      order: [["createdDate", "DESC"]],
    });
    return res.status(200).json({
      success: true,
      totalItems: campaigns.count,
      campaigns: campaigns,
      currentPage: page ? +page : 0,
      totalPages: Math.ceil(campaigns.count / limit),
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//-----------share campaign with other user--------------------------------------------
const shareCampaign = asyncHandler(async (req, res, next) => {
  try {
    const { campaignId } = req.body;
    const currentUserId = req.user.id;

    // Get recipient access token from a custom header
    const recipientAccessToken = req.headers["recipient-auth"];

    // Validate request
    if (!campaignId) {
      return next(new ErrorHandler("Campaign ID is required", 400));
    }

    if (!recipientAccessToken) {
      return next(
        new ErrorHandler(
          "Recipient access token is required in the 'recipient-auth' header",
          400
        )
      );
    }

    // Check if campaign exists and belongs to current user
    const campaign = await Campaign.findOne({
      where: {
        campaignID: campaignId,
        createdBy: currentUserId,
      },
    });

    if (!campaign) {
      return next(
        new ErrorHandler(
          "Campaign not found or you don't have permission to share it",
          404
        )
      );
    }

    // Decode the recipient's token to get their user ID
    let recipientUserId;
    try {
      // Remove 'Bearer ' prefix if it exists
      const token = recipientAccessToken.startsWith("Bearer ")
        ? recipientAccessToken.slice(7)
        : recipientAccessToken;

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      recipientUserId = decoded.obj.obj.id;
    } catch (error) {
      return next(new ErrorHandler("Invalid recipient access token", 400));
    }

    // Check if target user exists
    const targetUser = await User.findByPk(recipientUserId);
    if (!targetUser) {
      return next(new ErrorHandler("Target user not found", 404));
    }

    // Check if campaign is already shared with this user
    const existingShare = await CampaignEndUser.findOne({
      where: {
        campaignID: campaignId,
        userID: recipientUserId,
      },
    });

    if (existingShare) {
      return next(
        new ErrorHandler("Campaign is already shared with this user", 400)
      );
    }

    // Associate campaign with the target user
    await CampaignEndUser.create({
      campaignID: campaignId,
      userID: recipientUserId,
    });

    // Also ensure the owner is associated with the campaign in CampaignEndUser
    const ownerAssociation = await CampaignEndUser.findOne({
      where: {
        campaignID: campaignId,
        userID: currentUserId,
      },
    });

    if (!ownerAssociation) {
      await CampaignEndUser.create({
        campaignID: campaignId,
        userID: currentUserId,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Campaign successfully shared with user ${recipientUserId}`,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//---------Get all users with whom a campaign is shared-------------------------------
const getSharedUsers = asyncHandler(async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const currentUserId = req.user.id;

    // Check if campaign exists and belongs to current user
    const campaign = await Campaign.findOne({
      where: {
        campaignID: campaignId,
        createdBy: currentUserId,
      },
    });

    if (!campaign) {
      return next(
        new ErrorHandler(
          "Campaign not found or you don't have permission to view shared users",
          404
        )
      );
    }

    // Get all users with whom the campaign is shared
    const sharedUsers = await User.findAll({
      include: [
        {
          model: Campaign,
          as: "campaigns",
          where: { campaignID: campaignId },
          attributes: [],
        },
      ],
      where: {
        id: { [db.Sequelize.Op.ne]: currentUserId }, // Exclude the current user
      },
      attributes: ["id", "name", "email"], // Include only necessary user information
    });

    return res.status(200).json({
      success: true,
      data: sharedUsers,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//-----------remove the access from campaign---------------------------------------------
const removeSharedAccess = asyncHandler(async (req, res, next) => {
  try {
    const { campaignId, userId } = req.body;
    const currentUserId = req.user.id;

    // Validate request
    if (!campaignId || !userId) {
      return next(
        new ErrorHandler("Campaign ID and User ID are required", 400)
      );
    }

    // Check if campaign exists and belongs to current user
    const campaign = await Campaign.findOne({
      where: {
        campaignID: campaignId,
        createdBy: currentUserId,
      },
    });

    if (!campaign) {
      return next(
        new ErrorHandler(
          "Campaign not found or you don't have permission to manage sharing",
          404
        )
      );
    }

    // Remove the association
    const deleted = await CampaignEndUser.destroy({
      where: {
        campaignID: campaignId,
        userID: userId,
      },
    });

    if (!deleted) {
      return next(
        new ErrorHandler("Campaign is not shared with this user", 404)
      );
    }

    return res.status(200).json({
      success: true,
      message: `Shared access removed for user ${userId}`,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = {
  createCampaign,
  getAllCampaign,
  getOneCampaign,
  updateCampaign,
  deleteCampaign,
  getAllCampaignMetadata,
  shareCampaign,
  removeSharedAccess,
  getSharedUsers,
};
