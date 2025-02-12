const db = require("../dbConfig/dbConfig.js");
const Layout = db.layouts;
const Campaign = db.campaigns;
const { Op } = require("sequelize");
const {uploadFile,deleteFile}=require('../utils/cdnImplementation.js')
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

//---------------Create a new layout--------------------------------------
const createLayout = asyncHandler(async (req, res, next) => {
  // Start a transaction
  const transaction = await db.sequelize.transaction();

  try {
    const campaignID = req.params?.campaignID;
    // Destructure required fields from request body
    const { name, layoutJSON, isInitial } = req.body;

    // Validate required fields
    if (!name || !layoutJSON) {
      await transaction.rollback();
      return next(new ErrorHandler("Missing required fields.", 400));
    }
    if (!campaignID) {
      await transaction.rollback();
      return next(new ErrorHandler("Missing campaignId", 400));
    }

    // Validate data types
    if (typeof name !== "string") {
      await transaction.rollback();
      return next(
        new ErrorHandler("Invalid data types for required fields.", 400)
      );
    }

    // First check if the campaign exists
    const campaign = await Campaign.findByPk(campaignID, { transaction });
    if (!campaign) {
      await transaction.rollback();
      return next(
        new ErrorHandler(`Campaign with ID ${campaignID} not found`, 404)
      );
    }
    if (campaign.createdBy !== req.user.id) {
      await transaction.rollback();
      return next(new ErrorHandler("Unauthorized access", 403));
    }

    // Check for existing layouts with the same name for the same campaign
    const existingLayout = await Layout.findOne({
      where: { name, campaignID }, 
      transaction 
    });
    if (existingLayout) {
      await transaction.rollback();
      return next(
        new ErrorHandler(`${name} already exists for this campaign.`, 400)
      );
    }

    // If isInitial is true, check if another initial layout exists
    if (isInitial === true) {
      const existingInitialLayout = await Layout.findOne({
        where: { 
          campaignID,
          isInitial: true 
        },
        transaction
      });

      if (existingInitialLayout) {
        await transaction.rollback();
        return next(
          new ErrorHandler(
            `Campaign already has an initial layout: ${existingInitialLayout.name}. Only one layout can be set as initial.`,
            400
          )
        );
      }
    }

    // Upload layout JSON to CDN
    let layoutFileUpload;
    try {
      // Create a file-like object for MinIO upload
      const layoutFile = {
        buffer: Buffer.from(JSON.stringify(layoutJSON), 'utf-8'),
        originalname: `${name}_layout.json`,
        mimetype: 'application/json'
      };

      layoutFileUpload = await uploadFile(layoutFile);
    } catch (uploadError) {
      await transaction.rollback();
      return next(
        new ErrorHandler(`Failed to upload layout to CDN: ${uploadError.message}`, 500)
      );
    }

    // Prepare campaign data
    const layoutData = {
      name,
      layoutJSON: layoutJSON,
      campaignID: campaignID,
      isInitial: isInitial || false,
      cdnDetails: {
        cdnUrl: layoutFileUpload.url,
        fileName: layoutFileUpload.filename,
        originalName: layoutFileUpload.originalName,
        fileType: layoutFileUpload.mimetype,
        fileSize: layoutFileUpload.size,
        uploadedAt: new Date().toISOString()
      }
    };

    // Create campaign within the transaction
    const layout = await Layout.create(layoutData, { transaction });

    // Commit the transaction
    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: "Layout created successfully",
      data: {
        ...layout.toJSON()
      },
    });
  } catch (error) {
    // Rollback the transaction in case of any error
    if (transaction) await transaction.rollback();
    
    console.error("Error creating layout:", error);
    return next(
      new ErrorHandler("Failed to create layout" || error.message, 500)
    );
  }
});

//--------------Get all layouts with pagination---------------------------------
const getAllLayout = asyncHandler(async (req, res, next) => {
  // const { page = 0, size = 10 } = req.query; // Default values: page 0, size 10
  // const { limit, offset } = getPagination(page, size);

  // Get the campaignID from request parameters
  const campaignID = req.params?.campaignID;
  if (!campaignID) {
    return next(new ErrorHandler("Missing Campaign Id", 400));
  }
  const campaign = await Campaign.findOne({
    where: { campaignID: campaignID }
  });
  if(!campaign){
    return next(new ErrorHandler("Campaign not found with this campaignID",404));
  }
  // Create a condition to filter by campaignID and optionally by name
  const condition = {
    campaignID: campaign.campaignID, // Include campaignID in the condition
  };

  try {
    const data = await Layout.findAndCountAll({
      where: condition,
      include: [
        { model: Campaign, as: "campaign", attributes: ["campaignID"] },
      ],
      order: [["createdAt", "ASC"]],
    });
    console.log(data.rows);
    // Find the initial layout from the results
    const initialLayout = data.rows.find((layout) => layout.isInitial === true);

    return res.status(200).json({
      success: true,
      totalItems: data.count,
      layouts: data.rows,
      initialLayout: initialLayout || null, // Include the initial layout in response
    });
  } catch (error) {
    console.error("Error fetching layouts:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

//---------------Get a single layout by ID-------------------------------------
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

//----------------get all layout name-------------------------------------------------
const getAllLayoutName = asyncHandler(async (req, res, next) => {
  // Get the campaignID from request parameters
  const campaignID = req.params?.campaignID;
  if (!campaignID) {
    return next(new ErrorHandler("Missing Campaign Id", 400));
  }

  try {
    // Find all layout names for the specific campaign
    const layoutNames = await Layout.findAll({
      where: { 
        campaignID: campaignID 
      },
      attributes: ['layoutID', 'name', 'isInitial'], // Select specific attributes
      order: [['createdAt', 'ASC']] // Optional: order by creation time
    });

    return res.status(200).json({
      success: true,
      totalLayouts: layoutNames.length,
      layoutNames: layoutNames.map(layout => ({
        id: layout.layoutID,
        name: layout.name,
        isInitial: layout.isInitial
      }))
    });
  } catch (error) {
    console.error("Error fetching layout names:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

//----------------Update a layout-------------------------------------------------
const updateLayout = asyncHandler(async (req, res, next) => {
  // Start a transaction
  const transaction = await db.sequelize.transaction();

  try {
    if (!req.params?.id) {
      await transaction.rollback();
      return next(new ErrorHandler("Missing Layout Id", 400));
    }
    const layout = await Layout.findByPk(req.params.id, { transaction });
    if (!layout) {
      await transaction.rollback();
      return next(new ErrorHandler("Layout not found", 404));
    }
    const campaignID = layout.campaignID;

    // First check if the campaign exists
    const campaign = await Campaign.findByPk(campaignID, { transaction });
    if (!campaign) {
      await transaction.rollback();
      return next(
        new ErrorHandler(`Campaign with ID ${campaignID} not found`, 404)
      );
    }
    if (campaign.createdBy !== req.user.id) {
      await transaction.rollback();
      return next(new ErrorHandler("Unauthorized access", 403));
    }

    // Handle isInitial flag update
    if (req.body.isInitial === true && !layout.isInitial) {
      // Find current initial layout and update it to false
      await Layout.update(
        { isInitial: false },
        {
          where: {
            campaignID: campaignID,
            isInitial: true,
            layoutID: { [Op.ne]: req.params.id } // Exclude current layout
          },
          transaction
        }
      );
    }

    // Prepare updated layout data
    const updatedLayoutData = {
      ...req.body
    };

    // If layoutJSON is being updated, upload to CDN
    if (updatedLayoutData.layoutJSON) {
      try {
        // Create a file-like object for MinIO upload
        const layoutFile = {
          buffer: Buffer.from(JSON.stringify(updatedLayoutData.layoutJSON), 'utf-8'),
          originalname: `${layout.name}_layout.json`,
          mimetype: 'application/json'
        };

        // Upload new JSON file to CDN
        const layoutFileUpload = await uploadFile(layoutFile);

        // Update CDN details
        updatedLayoutData.cdnDetails = {
          cdnUrl: layoutFileUpload.url,
          fileName: layoutFileUpload.filename,
          originalName: layoutFileUpload.originalName,
          fileType: layoutFileUpload.mimetype,
          fileSize: layoutFileUpload.size,
          uploadedAt: new Date().toISOString()
        };

        // Delete the old JSON file from CDN if it exists
        if (layout.cdnDetails && layout.cdnDetails.fileName) {
          try {
            await deleteFile(layout.cdnDetails.fileName);
          } catch (deleteError) {
            console.warn('Could not delete old layout file:', deleteError);
          }
        }
      } catch (uploadError) {
        await transaction.rollback();
        return next(
          new ErrorHandler(`Failed to upload updated layout to CDN: ${uploadError.message}`, 500)
        );
      }
    }

    // Update the layout in the database
    const [updated] = await Layout.update(updatedLayoutData, {
      where: { layoutID: req.params.id },
      transaction
    });

    if (updated) {
      const updatedLayout = await Layout.findByPk(req.params.id, { transaction });
      
      // Commit the transaction
      await transaction.commit();

      return res.status(200).json({
        status: true,
        message: "Layout updated successfully",
        data: updatedLayout,
      });
    } else {
      await transaction.rollback();
      return next(new ErrorHandler("Failed to update layout", 400));
    }
  } catch (error) {
    // Rollback the transaction in case of any error
    if (transaction) await transaction.rollback();

    console.error("Error updating layout:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

//-----------------Delete a layout---------------------------------------------
const deleteLayout = asyncHandler(async (req, res, next) => {
  // Start a transaction
  const transaction = await db.sequelize.transaction();

  try {
    if (!req.params?.id) {
      await transaction.rollback();
      return next(new ErrorHandler("Missing Layout Id", 400));
    }

    // Find the layout first to get CDN details before deletion
    const layout = await Layout.findByPk(req.params.id, { transaction });
    if (!layout) {
      await transaction.rollback();
      return next(new ErrorHandler("Layout not found", 404));
    }

    // Check campaign ownership
    const campaign = await Campaign.findByPk(layout.campaignID, { transaction });
    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Associated Campaign not found", 404));
    }
    if (campaign.createdBy !== req.user.id) {
      await transaction.rollback();
      return next(new ErrorHandler("Unauthorized access", 403));
    }

    // Delete CDN file if exists
    if (layout.cdnDetails && layout.cdnDetails.fileName) {
      try {
        await deleteFile(layout.cdnDetails.fileName);
      } catch (deleteError) {
        console.warn('Could not delete layout file from CDN:', deleteError);
        // Continue with database deletion even if CDN deletion fails
      }
    }

    // Destroy the layout from database
    const deleted = await Layout.destroy({
      where: { layoutID: req.params.id },
      transaction
    });

    if (deleted) {
      // Commit the transaction
      await transaction.commit();

      return res
        .status(200)
        .json({ status: true, message: "Layout deleted successfully" });
    } else {
      await transaction.rollback();
      return next(new ErrorHandler("Layout deletion failed", 500));
    }
  } catch (error) {
    // Rollback the transaction in case of any error
    if (transaction) await transaction.rollback();

    console.error("Error deleting layout:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

//----------------get all layout by shor code--------------------------
const getAllLayoutByShortCode = asyncHandler(async (req, res, next) => {
  // const { page = 0, size = 10 } = req.query; // Default values: page 0, size 10
  // const { limit, offset } = getPagination(page, size);

  // Get the campaignID from request parameters
  const campaignShortCode = req.params?.shortCode;
  if (!campaignShortCode) {
    return next(new ErrorHandler("Missing Campaign Code", 400));
  }
  const campaign = await Campaign.findOne({
    where: { shortCode: campaignShortCode }
  });
  if(!campaign){
    return next(new ErrorHandler("Campaign not found with this shortId",404));
  }
  const campaignID=campaign.campaignID
  // Create a condition to filter by campaignID and optionally by name
  const condition = {
    campaignID: campaignID, // Include campaignID in the condition
  };

  try {
    const data = await Layout.findAndCountAll({
      where: condition,
      include: [
        { model: Campaign, as: "campaign", attributes: ["campaignID"] },
      ],
      order: [["createdAt", "ASC"]],
    });
    console.log(data.rows);
    // Find the initial layout from the results
    const initialLayout = data.rows.find((layout) => layout.isInitial === true);

    return res.status(200).json({
      success: true,
      totalItems: data.count,
      layouts: data.rows,
      initialLayout: initialLayout || null, // Include the initial layout in response
    });
  } catch (error) {
    console.error("Error fetching layouts:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});


module.exports = {
  createLayout,
  getAllLayout,
  getAllLayoutName,
  getOneLayout,
  updateLayout,
  deleteLayout,
  getAllLayoutByShortCode
};
