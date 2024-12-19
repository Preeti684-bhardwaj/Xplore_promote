const db = require("../dbConfig/dbConfig.js");
// const Layout = db.layouts;
const Campaign = db.campaigns;
const CustomFont = db.customFonts;
const User = db.users;
const { Op } = require("sequelize");
const { uploadFile, deleteFile } = require("../utils/cdnImplementation.js");
const { getPagination } = require("../validators/campaignValidations.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

// Sanitize font weight helper function
const sanitizeFontWeight = (weight) => {
  if (!weight) return "";
  // Convert to string, trim whitespace, and convert to lowercase
  return weight.toString().trim().toLowerCase();
};

// Upload a custom font
const uploadCustomFont = async (req, res, next) => {
  const transaction = await db.sequelize.transaction();

  try {
    // Validate request - checking for files array
    if (!req.files || req.files.length === 0) {
      return next(new ErrorHandler("Font file is required", 400));
    }

    if (!req.body.name || !req.body.fontWeight) {
      return next(new ErrorHandler("Font name and weight are required", 400));
    }

    const fontFile = req.files[0];
    const name = req.body.name.trim(); // Sanitize name too
    const fontWeight = sanitizeFontWeight(req.body.fontWeight);
    // const userId = req.user?.id;
    const campaignID = req.params.campaignID;

    // Validate sanitized font weight is not empty
    if (!fontWeight) {
      return next(new ErrorHandler("Invalid font weight", 400));
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

    // Validate font weight format
    // if (!validateFontWeight(fontWeight)) {
    //   return next(new ErrorHandler('Invalid font weight format', 400));
    // }

    // Check if font name exists for this campaignId
    let existingFont = await CustomFont.findOne({
      where: { name, campaignID: campaignID },
      transaction,
    });

    // If font exists, check for weight collision
    if (existingFont) {
      const currentWeights = existingFont.fontWeight || {};
      if (currentWeights[fontWeight]) {
        return res.status(200).json({
          success: true,
          message: "Font weight already exists",
          data: currentWeights[fontWeight],
        });
      }

      // Upload new font file to CDN
      const customFontUpload = await uploadFile({
        buffer: fontFile.buffer,
        originalname: fontFile.originalname,
        mimetype: fontFile.mimetype,
      });
      // Add new weight to existing font
      const updatedWeights = {
        ...currentWeights,
        [fontWeight]: customFontUpload.url,
      };

      await existingFont.update(
        { fontWeight: updatedWeights },
        { transaction }
      );

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: "Font weight added successfully",
        data: existingFont,
      });
    }

    // Create new font entry
    const customFontUpload = await uploadFile({
      buffer: fontFile.buffer,
      originalname: fontFile.originalname,
      mimetype: fontFile.mimetype,
    });
    const newFont = await CustomFont.create(
      {
        name,
        fontWeight: { [fontWeight]: customFontUpload.url },
        campaignID: campaignID,
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: "Font uploaded successfully",
      data: newFont,
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
};

// Get all fonts for a user
const getAllFonts = async (req, res, next) => {
  try {
    // Get the campaignID from request parameters
    const campaignID = req.params?.campaignID;
    if (!campaignID) {
      return next(new ErrorHandler("Missing Campaign Id", 400));
    }
    const campaign = await Campaign.findOne({
      where: { campaignID: campaignID },
    });
    if (!campaign) {
      return next(
        new ErrorHandler("Campaign not found with this campaignID", 404)
      );
    }
    // Create a condition to filter by campaignID and optionally by name
    const condition = {
      campaignID: campaign.campaignID, // Include campaignID in the condition
    };
    const fonts = await CustomFont.findAll({
      where:condition,
      include: [
        { model: Campaign, as: "campaign", attributes: ["campaignID"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      count: fonts.length,
      data: fonts,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
};

// Get font by ID
const getFontById = async (req, res, next) => {
  try {
    if (!req.params?.id) {
        return next(new ErrorHandler("Missing font Id", 400));
      }
      const customFont = await CustomFont.findByPk(req.params.id, {
        include: [
          { model: Campaign, as: "campaign", attributes: ["campaignID"] },
        ],
      });
      if (customFont) {
        return res.status(200).json({ success: true, data: customFont });
      } else {
        return next(new ErrorHandler("font not found", 404));
      }
    } catch (error) {
      console.error("Error fetching font:", error);
      return next(new ErrorHandler(error.message, 500));
    }
};

module.exports = {
  uploadCustomFont,
  getAllFonts,
  getFontById,
};
