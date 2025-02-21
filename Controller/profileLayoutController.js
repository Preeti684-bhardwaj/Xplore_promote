const db = require("../dbConfig/dbConfig.js");
const ProfileLayout = db.profileLayout;
const User = db.users;
const { Op } = require("sequelize");
const { uploadFile, deleteFile } = require("../utils/cdnImplementation.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

//---------------Create a new layout--------------------------------------
const createProfileLayout = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();

  try {
    const userId = req.user?.id;
    let { name, layoutJSON } = req.body;

    // Validate required fields
    if (!name || !layoutJSON) {
      await transaction.rollback();
      return next(new ErrorHandler("Missing required fields.", 400));
    }
    if (!userId) {
      await transaction.rollback();
      return next(new ErrorHandler("Missing userId", 400));
    }

    // Validate data types
    if (typeof name !== "string") {
      await transaction.rollback();
      return next(
        new ErrorHandler("Invalid data types for required fields.", 400)
      );
    }

    // Check if the name already exists in ProfileLayout table
    const existingLayout = await ProfileLayout.findOne({
      where: { name },
      transaction,
    });

    if (existingLayout) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "name already exists. Please choose a different name.",
          400
        )
      );
    }

    // Once we confirm name is unique, create shortcode from it
    let shortCode = name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 30);

    const shortUrl = `https://xplr.live/${shortCode}`;

    // Check if the user exists
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return next(new ErrorHandler(`User with ID ${userId} not found`, 404));
    }

    // Upload layout JSON to CDN
    let layoutFileUpload;
    try {
      const layoutFile = {
        buffer: Buffer.from(JSON.stringify(layoutJSON), "utf-8"),
        originalname: `${shortCode}_layout.json`,
        mimetype: "application/json",
      };

      layoutFileUpload = await uploadFile(layoutFile);
    } catch (uploadError) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          `Failed to upload layout to CDN: ${uploadError.message}`,
          500
        )
      );
    }

    // Prepare layout data
    const layoutData = {
      name: name,
      shortCode: shortCode,
      shortUrl: shortUrl,
      layoutJSON: layoutJSON,
      userId: userId,
      cdnDetails: {
        cdnUrl: layoutFileUpload.url,
        fileName: layoutFileUpload.filename,
        originalName: layoutFileUpload.originalName,
        fileType: layoutFileUpload.mimetype,
        fileSize: layoutFileUpload.size,
        uploadedAt: new Date().toISOString(),
      },
    };

    // Create layout within the transaction
    const layout = await ProfileLayout.create(layoutData, { transaction });

    // Commit the transaction
    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: "Layout created successfully",
      data: {
        ...layout.toJSON(),
      },
    });
  } catch (error) {
    // Rollback the transaction in case of any error
    if (transaction) await transaction.rollback();

    console.error("Error creating layout:", error);
    return next(
      new ErrorHandler(error.message || "Failed to create layout", 500)
    );
  }
});
//--------------Get all layouts with pagination---------------------------------
const getAllProfileLayout = asyncHandler(async (req, res, next) => {
  // const { page = 0, size = 10 } = req.query; // Default values: page 0, size 10
  // const { limit, offset } = getPagination(page, size);

  // Get the campaignID from request parameters
  const userId = req.user?.id;
  if (!userId) {
    return next(new ErrorHandler("Missing User Id", 400));
  }
  const user = await User.findOne({
    where: { id: userId },
  });
  if (!user) {
    return next(new ErrorHandler("User not found", 404));
  }
  // Create a condition to filter by campaignID and optionally by name
  const condition = {
    userId: user.id, // Include campaignID in the condition
  };

  try {
    const data = await ProfileLayout.findAndCountAll({
      where: condition,
      include: [{ model: User, as: "users", attributes: ["id"] }],
      order: [["createdAt", "ASC"]],
    });
    console.log(data.rows);

    return res.status(200).json({
      success: true,
      totalItems: data.count,
      layouts: data.rows,
    });
  } catch (error) {
    console.error("Error fetching layouts:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

//---------------Get a single layout by ID-------------------------------------
const getOneProfileLayout = asyncHandler(async (req, res, next) => {
  try {
    if (!req.params?.id) {
      return next(new ErrorHandler("Missing Layout Id", 400));
    }
    const layout = await ProfileLayout.findByPk(req.params.id, {
      include: [{ model: User, as: "users", attributes: ["id"] }],
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
const getAllProfileLayoutName = asyncHandler(async (req, res, next) => {
  // Get the campaignID from request parameters
  const userId = req.params?.id;
  if (!userId) {
    return next(new ErrorHandler("Missing User Id", 400));
  }

  try {
    // Find all layout names for the specific campaign
    const layoutNames = await ProfileLayout.findAll({
      where: {
        userId: userId,
      },
      attributes: ["id", "name"], // Select specific attributes
      order: [["createdAt", "ASC"]], // Optional: order by creation time
    });

    return res.status(200).json({
      success: true,
      totalLayouts: layoutNames.length,
      layoutNames: layoutNames.map((layout) => ({
        id: layout.id,
        name: layout.name,
      })),
    });
  } catch (error) {
    console.error("Error fetching layout names:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

//----------------Update a layout-------------------------------------------------
const updateProfileLayout = asyncHandler(async (req, res, next) => {
  // Start a transaction
  const transaction = await db.sequelize.transaction();

  try {
    if (!req.params?.id) {
      await transaction.rollback();
      return next(new ErrorHandler("Missing Layout Id", 400));
    }
    const layout = await ProfileLayout.findOne(
      { where: { id: req.params.id } },
      transaction
    );
    if (!layout) {
      await transaction.rollback();
      return next(new ErrorHandler("Layout not found", 404));
    }
    const userId = layout.userId;

    // First check if the campaign exists
    const user = await User.findOne({ where: { id: userId } }, transaction);
    if (!user) {
      await transaction.rollback();
      return next(
        new ErrorHandler(`User with ID ${campaignID} not found`, 404)
      );
    }

    // Prepare updated layout data
    const updatedLayoutData = {
      ...req.body,
    };

    // If layoutJSON is being updated, upload to CDN
    if (updatedLayoutData.layoutJSON) {
      try {
        // Create a file-like object for MinIO upload
        const layoutFile = {
          buffer: Buffer.from(
            JSON.stringify(updatedLayoutData.layoutJSON),
            "utf-8"
          ),
          originalname: `${layout.name}_layout.json`,
          mimetype: "application/json",
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
          uploadedAt: new Date().toISOString(),
        };

        // Delete the old JSON file from CDN if it exists
        if (layout.cdnDetails && layout.cdnDetails.fileName) {
          try {
            await deleteFile(layout.cdnDetails.fileName);
          } catch (deleteError) {
            console.warn("Could not delete old layout file:", deleteError);
          }
        }
      } catch (uploadError) {
        await transaction.rollback();
        return next(
          new ErrorHandler(
            `Failed to upload updated layout to CDN: ${uploadError.message}`,
            500
          )
        );
      }
    }

    // Update the layout in the database
    const [updated] = await ProfileLayout.update(updatedLayoutData, {
      where: { id: req.params.id },
      transaction,
    });

    if (updated) {
      const updatedLayout = await ProfileLayout.findByPk(req.params.id, {
        transaction,
      });

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
const deleteProfileLayout = asyncHandler(async (req, res, next) => {
  // Start a transaction
  const transaction = await db.sequelize.transaction();

  try {
    if (!req.params?.shortCode) {
      await transaction.rollback();
      return next(new ErrorHandler("Missing Layout shortCode", 400));
    }

    // Find the layout first to get CDN details before deletion
    const layout = await ProfileLayout.findOne(
      { where: { shortCode: req.params?.shortCode } },
      transaction
    );
    if (!layout) {
      await transaction.rollback();
      return next(new ErrorHandler("Layout not found", 404));
    }

    // Check campaign ownership
    const user = await User.findByPk(layout.userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return next(new ErrorHandler("Associated User not found", 404));
    }

    // Delete CDN file if exists
    if (layout.cdnDetails && layout.cdnDetails.fileName) {
      try {
        await deleteFile(layout.cdnDetails.fileName);
      } catch (deleteError) {
        console.warn("Could not delete layout file from CDN:", deleteError);
        // Continue with database deletion even if CDN deletion fails
      }
    }

    // Destroy the layout from database
    const deleted = await ProfileLayout.destroy({
      where: { shortCode: req.params?.shortCode },
      transaction,
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
// const getAllProfileLayoutByShortCode = asyncHandler(async (req, res, next) => {
//   // const { page = 0, size = 10 } = req.query; // Default values: page 0, size 10
//   // const { limit, offset } = getPagination(page, size);

//   // Get the campaignID from request parameters
//   const layoutShortCode = req.params?.shortCode;
//   if (!layoutShortCode) {
//     return next(new ErrorHandler("Missing layout Code", 400));
//   }
//   const profileLayout = await ProfileLayout.findOne({
//     where: { shortCode: layoutShortCode },
//   });
//   if (!profileLayout) {
//     return next(new ErrorHandler("Layout not found.", 404));
//   }
//   const userId = profileLayout.userId;
//   // Create a condition to filter by campaignID and optionally by name
//   const condition = {
//     id: userId, // Include campaignID in the condition
//   };

//   try {
//     const data = await ProfileLayout.findAndCountAll({
//       where: condition,
//       include: [{ model: User, as: "users", attributes: ["id"] }],
//       order: [["createdAt", "ASC"]],
//     });
//     console.log(data.rows);

//     return res.status(200).json({
//       success: true,
//       totalItems: data.count,
//       layouts: data.rows,
//     });
//   } catch (error) {
//     console.error("Error fetching layouts:", error);
//     return next(new ErrorHandler(error.message, 500));
//   }
// });

module.exports = {
  createProfileLayout,
  getAllProfileLayout,
  getOneProfileLayout,
  getAllProfileLayoutName,
  updateProfileLayout,
  deleteProfileLayout,
  // getAllProfileLayoutByShortCode,
};
