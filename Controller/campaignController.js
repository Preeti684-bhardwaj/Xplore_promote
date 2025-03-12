const db = require("..//dbConfig/dbConfig.js");
const Campaign = db.campaigns;
const Layout = db.layouts;
const { Op } = require("sequelize");
const User = db.users;
const { uploadFiles, deleteFile } = require("../utils/cdnImplementation.js");
const {validateFiles,getPagination} = require("../validators/campaignValidations.js");
const {getCampaignStatus,validateTiming} = require("../utils/campaignStatusManager.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");
const shortId = require("shortid");

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
    // const { page, size, name, startDate, endDate, status } = req.query;
    const { page = 0, size = 10 } = req.query; // Default values: page 0, size 10
    const { limit, offset } = getPagination(page, size);
    const userID = req.user.id;
    // Build filter conditions
    const condition = {
      createdBy: req.user.id,
      // ...(name && { name: { [Op.iLike]: `%${name}%` } }),
      // ...(status && { status }),
      // ...(startDate && endDate && {
      //   createdDate: {
      //     [Op.between]: [new Date(startDate), new Date(endDate)]
      //   }
      // })
    };

    const campaigns = await Campaign.findAndCountAll({
      where: condition,
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
          through: { where: { userID } },
        },
      ],
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
    const campaign = await Campaign.findOne({
      where: {
        campaignID: req.params?.id,
        createdBy: req.user?.id,
      },
      include: [
        {
          model: Layout,
          as: "layouts",
          order: [["createdAt", "ASC"]], // Order layouts by createdAt in ascending order
        },
        {
          model: User,
          as: "users",
          through: { where: { userID } },
        },
      ],
      order: [[{ model: Layout, as: "layouts" }, "createdAt", "ASC"]],
    });

    if (!campaign) {
      return next(
        new ErrorHandler(`Campaign not found for user ${req.user.id}`, 404)
      );
    }
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
    return res.status(200).json({
      success: true,
      data: campaign,
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

    if (campaign.createdBy !== req.user.id) {
      return next(new ErrorHandler("Unauthorized access", 403));
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
        if (campaign.images && campaign.images.length > 0) {
          await Promise.all(
            campaign.images.map((image) => deleteFile(image.filename))
          );
        }
        
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
        transaction: t
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
      attributes: ['campaignID', 'name', 'description','images'],
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

module.exports = {
  createCampaign,
  getAllCampaign,
  getOneCampaign,
  updateCampaign,
  deleteCampaign,
  getAllCampaignMetadata
};
