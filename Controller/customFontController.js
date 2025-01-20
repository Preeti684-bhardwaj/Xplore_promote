const db = require("../dbConfig/dbConfig.js");
// const Layout = db.layouts;
const Campaign = db.campaigns;
const CustomFont = db.customFonts;
const User = db.users;
const FontWeight = db.FontWeight;
const axios = require("axios");
const { uploadFile,deleteFile} = require("../utils/cdnImplementation.js");
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

// Upload a custom font
const uploadUserCustomFont = async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    // Validate request - checking for files array
    if (!req.files || req.files.length === 0) {
      return next(new ErrorHandler("Font file is required", 400));
    }
    if (!req.body.name || !req.body.fontWeightName || !req.body.specificName) {
      return next(
        new ErrorHandler(
          "Font name, weight name and specific name are required",
          400
        )
      );
    }

    const fontFile = req.files[0];
    const name = req.body.name.trim();
    const fontWeightName = sanitizeFontWeight(req.body.fontWeightName);
    const specificName = sanitizeFontWeight(req.body.specificName);
    const userId = req.user?.id;

    if (!fontWeightName) {
      return next(new ErrorHandler("Invalid font weight name", 400));
    }
    if (!specificName) {
      return next(new ErrorHandler("Invalid specific name", 400));
    }

    // Check if user exists
    const user = await User.findOne({ where: { id: userId }, transaction });
    if (!user) {
      await transaction.rollback();
      return next(new ErrorHandler(`User with ID ${userId} not found`, 404));
    }

    // Check if font name exists for this userId
    let existingFont = await CustomFont.findOne({
      where: { name, userId },
      include: [
        {
          model: db.FontWeight,
          as: "fontWeights",
        },
      ],
      transaction,
    });

    // Check if specificName already exists for any font
    const existingSpecificName = await FontWeight.findOne({
      where: { specificName },
      transaction,
    });

    if (existingSpecificName) {
      await transaction.rollback();
      return next(new ErrorHandler("Specific name must be unique", 400));
    }

    if (existingFont) {
      // Check if this weight already exists
      const existingWeight = existingFont.fontWeights.find(
        (fw) => fw.name === fontWeightName
      );

      if (existingWeight) {
        // Transform the response to match desired format
        const responseData = {
          id: existingFont.id,
          name: existingFont.name,
          fontWeights: existingFont.fontWeights.map((fw) => ({
            id: fw.id,
            fontWeightName: fw.name,
            specificName: fw.specificName,
            fontWeightFile: fw.fontWeightFile,
          })),
        };

        return res.status(200).json({
          success: true,
          message: "Font weight already exists",
          data: responseData,
        });
      }

      // Upload new font file to CDN
      const customFontUpload = await uploadFile({
        buffer: fontFile.buffer,
        originalname: fontFile.originalname,
        mimetype: fontFile.mimetype,
      });

      // Add new weight to existing font
      await db.FontWeight.create(
        {
          name: fontWeightName,
          specificName: specificName,
          fontWeightFile: customFontUpload.url,
          customFontId: existingFont.id,
        },
        { transaction }
      );

      // Fetch updated font with all weights
      const updatedFont = await CustomFont.findOne({
        where: { id: existingFont.id },
        include: [
          {
            model: db.FontWeight,
            as: "fontWeights",
          },
        ],
        transaction,
      });

      await transaction.commit();

      // Transform response to match desired format
      const responseData = {
        id: updatedFont.id,
        name: updatedFont.name,
        fontWeights: updatedFont.fontWeights.map((fw) => ({
          id: fw.id,
          fontWeightName: fw.name,
          specificName: fw.specificName,
          fontWeightFile: fw.fontWeightFile,
        })),
      };

      return res.status(200).json({
        success: true,
        message: "Font weight added successfully",
        data: responseData,
      });
    }

    // Create new font entry
    const customFontUpload = await uploadFile({
      buffer: fontFile.buffer,
      originalname: fontFile.originalname,
      mimetype: fontFile.mimetype,
    });

    // Create new font
    const newFont = await CustomFont.create(
      {
        name,
        userId,
      },
      { transaction }
    );

    // Create initial font weight
    const newFontWeight = await db.FontWeight.create(
      {
        name: fontWeightName,
        specificName: specificName,
        fontWeightFile: customFontUpload.url,
        customFontId: newFont.id,
      },
      { transaction }
    );

    await transaction.commit();

    // Transform response to match desired format
    const responseData = {
      id: newFont.id,
      name: newFont.name,
      fontWeights: [
        {
          id: newFontWeight.id,
          fontWeightName: newFontWeight.name,
          specificName: newFontWeight.specificName,
          fontWeightFile: newFontWeight.fontWeightFile,
        },
      ],
    };

    return res.status(201).json({
      success: true,
      message: "Font uploaded successfully",
      data: responseData,
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
      where: condition,
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

// Get all fonts for a user
const getAllUserFonts = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(new ErrorHandler("Access Denied", 403));
    }

    const user = await User.findOne({
      where: { id: userId },
    });

    if (!user) {
      return next(new ErrorHandler("User not found with this Id", 404));
    }

    // Modified query to include FontWeight data
    const fonts = await CustomFont.findAll({
      where: { userId: user.id },
      include: [
        { 
          model: User, 
          as: "user", 
          attributes: ["id"] 
        },
        {
          model: db.FontWeight,
          as: "fontWeights",
          attributes: ["id", "name", "specificName", "fontWeightFile"]
        }
      ],
      order: [["createdAt", "DESC"]],
    });

    // Transform the response to match the desired format
    const transformedFonts = fonts.map(font => ({
      id: font.id,
      name: font.name,
      userId: font.userId,
      createdAt: font.createdAt,
      updatedAt: font.updatedAt,
      fontWeights: font.fontWeights.map(weight => ({
        id: weight.id,
        fontWeightName: weight.name,
        specificName: weight.specificName,
        fontWeightFile: weight.fontWeightFile
      }))
    }));

    return res.status(200).json({
      success: true,
      count: fonts.length,
      data: transformedFonts
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
};

const downloadFontBySpecificName =asyncHandler(async (req, res, next) => {
  try {
    const { specificName } = req.query;

    if (!specificName) {
      return next(new ErrorHandler("Specific name is required", 400));
    }

    const fontWeight = await db.FontWeight.findOne({
      where: { specificName },
      include: [{
        model: db.customFonts,
        as: "customFont",
        attributes: ["name"],
      }],
    });

    if (!fontWeight) {
      return next(new ErrorHandler("Font not found", 404));
    }

    const fontFileUrl = fontWeight.fontWeightFile;
    console.log(fontFileUrl);

    try {
      // Use axios instead of fetch
      const response = await axios({
        method: 'get',
        url: fontFileUrl,
        responseType: 'arraybuffer'
      });

      // Set appropriate headers
      res.setHeader('Content-Type', 'font/ttf');
      res.setHeader(
        'Content-Disposition', 
        `attachment; filename="${fontWeight.customFont.name}_${fontWeight.name}.ttf"`
      );
      res.setHeader('Content-Length', response.data.length);

      // Send the file
      return res.send(response.data);

    } catch (error) {
      console.error('Download error:', error.message); // Add detailed error logging
      return next(new ErrorHandler("Error downloading font file", 500));
    }
  } catch (error) {
    console.error('General error:', error.message); // Add detailed error logging
    return next(new ErrorHandler(error.message, 500));
  }
});


const fontUrlBySpecificName=asyncHandler(async (req, res, next) => {
  try {
    const { specificName } = req.query;

    if (!specificName) {
      return next(new ErrorHandler("Specific name is required", 400));
    }

    const fontWeight = await db.FontWeight.findOne({
      where: { specificName },
      include: [{
        model: db.customFonts,
        as: "customFont",
        attributes: ["name"],
      }],
    });

    if (!fontWeight) {
      return next(new ErrorHandler("Font not found", 404));
    }

    const fontFileUrl = fontWeight.fontWeightFile;
    console.log(fontFileUrl);
      // Send the file
      return res.status(200).send({success:true,data:fontFileUrl});
  } catch (error) {
    console.error('General error:', error.message); // Add detailed error logging
    return next(new ErrorHandler(error.message, 500));
  }
});

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
// delete fontweight file from cdn and db 
const deleteFontWeight = async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!id) {
      return next(new ErrorHandler("Font weight ID is required", 400));
    }

    // Find the font weight and include the associated custom font for ownership verification
    const fontWeight = await db.FontWeight.findOne({
      where: { id },
      include: [{
        model: db.customFonts,
        as: "customFont",
        where: { userId }, // Ensure the font belongs to the requesting user
        required: true
      }],
      transaction
    });

    if (!fontWeight) {
      await transaction.rollback();
      return next(new ErrorHandler("Font weight not found or unauthorized", 404));
    }

    // Extract the filename from the CDN URL
    const fontWeightFile = fontWeight.fontWeightFile;
    const fileName = fontWeightFile.split('/').pop(); // Get the last part of the URL

    try {
      // Delete file from MinIO/CDN
      await deleteFile(fileName);
    } catch (error) {
      console.error('Error deleting file from storage:', error);
      await transaction.rollback();
      return next(new ErrorHandler("Error deleting font file from storage", 500));
    }

    // Delete the font weight from database
    await fontWeight.destroy({ transaction });

    // Check if this was the last weight for the font
    const remainingWeights = await db.FontWeight.count({
      where: { customFontId: fontWeight.customFontId },
      transaction
    });

    // If no weights remain, delete the parent font
    if (remainingWeights === 0) {
      await db.customFonts.destroy({
        where: { id: fontWeight.customFontId },
        transaction
      });
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Font weight deleted successfully",
      data: {
        id: fontWeight.id,
        fontWeightName: fontWeight.name,
        specificName: fontWeight.specificName,
        // wasLastWeight: remainingWeights === 0
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Delete font weight error:', error);
    return next(new ErrorHandler(error.message, 500));
  }
};

module.exports = {
  uploadCustomFont,
  uploadUserCustomFont,
  downloadFontBySpecificName,
  fontUrlBySpecificName,
  getAllFonts,
  getAllUserFonts,
  getFontById,
  deleteFontWeight
};
