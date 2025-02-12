const db = require("../dbConfig/dbConfig.js");
const Campaign = db.campaigns;
const ProductImage = db.productImages;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

//------------upload product image------------------------------------------
const uploadProductImages = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const {
      productModalId,
      productName,
      imageBaseUrl,
      vr_exterior,
      vr_interior,
    } = req.body;
    const campaignID = req.params.campaignID;

    // Validate required fields
    if (
      !productModalId ||
      !productName ||
      !campaignID ||
      !imageBaseUrl ||
      !vr_exterior ||
      !vr_interior
    ) {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    // Validate files array
    // if (!Array.isArray(files) || files.length === 0) {
    //   return next(new ErrorHandler("At least one image file is required", 400));
    // }

    // Validate campaign exists
    const campaign = await Campaign.findByPk(campaignID);
    if (!campaign) {
      return next(new ErrorHandler("Campaign not found", 404));
    }

    // Check authorization
    if (campaign.createdBy !== req.user.id) {
      await transaction.rollback();
      return next(new ErrorHandler("Unauthorized access", 403));
    }

    // Check if product with same name exists in this campaign
    const existingProduct = await ProductImage.findOne({
      where: {
        campaignID,
        productModalId: productModalId.trim(), // Trim to handle whitespace variations
      },
    });

    if (existingProduct) {
      await transaction.rollback();
      return res.status(200).json({
        success: true,
        message: "Product with this modal Id already exists",
        data: existingProduct,
      });
    }

    // Parse and validate color details
    // let parsedColorDetails;
    // try {
    //   parsedColorDetails = JSON.parse(colorDetails);
    //   validateColorDetails(parsedColorDetails);
    // } catch (error) {
    //   await transaction.rollback();
    //   return next(
    //     new ErrorHandler(`Invalid color details: ${error.message}`, 400)
    //   );
    // }

    // Validate and upload each file
    try {
      // const uploadPromises = files.map(async (file) => {
      //   validateFiles(file);
      //   const uploadResult = await uploadFile(file);

      //   return {
      //     fileName: uploadResult.filename,
      //     originalName: file.originalname,
      //     fileSize: file.size,
      //     cdnUrl: uploadResult.url,
      //     uploadedAt: new Date().toISOString(),
      //   };
      // });

      // const uploadedImages = await Promise.all(uploadPromises);

      // Create product images record
      const productImage = await ProductImage.create(
        {
          productName: productName.trim(),
          productModalId: productModalId, // Store trimmed product name
          campaignID,
          imageBaseUrl,
          vr_exterior,
          vr_interior,
        },
        { transaction }
      );

      await transaction.commit();

      return res.status(201).json({
        success: true,
        message: "Product images created successfully",
        data: productImage,
      });
    } catch (uploadError) {
      await transaction.rollback();
      return next(
        new ErrorHandler(`File upload failed: ${uploadError.message}`, 400)
      );
    }
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

//--------------get product image by campaign--------------------------------
const getProductImagesByCampaign = asyncHandler(async (req, res) => {
  try {
    const { campaignID } = req.params;

    if (!campaignID) {
      return next(new ErrorHandler("Campaign ID is required", 400));
    }

    // Validate campaign exists
    const campaign = await Campaign.findByPk(campaignID);
    if (!campaign) {
      return next(new ErrorHandler("Campaign not found", 404));
    }

    const productImages = await ProductImage.findAll({
      where: { campaignID },
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: productImages,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//-----------------get product image by id------------------------------------------
const getProductImageById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return next(new ErrorHandler("Product Image ID is required", 400));
    }

    const productImage = await ProductImage.findOne({
      where: { id },
      include: [
        {
          model: Campaign,
          as: "campaign",
          attributes: ["campaignID", "name"], // Add other campaign attributes you want to include
        },
      ],
    });

    if (!productImage) {
      return next(new ErrorHandler("Product Image not found", 404));
    }

    return res.status(200).json({
      success: true,
      data: productImage,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

//-------------------update product images------------------------------------------- 
const updateProductImages = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { productName, imageBaseUrl, vr_exterior, vr_interior } = req.body;
    // const files = req.files;
    const { id } = req.params; // product image id

    //  Validate at least one update field is provided
    if (!productName && !imageBaseUrl && !vr_exterior && !vr_interior) {
      return next(
        new ErrorHandler("Either new colors or images must be provided", 400)
      );
    }

    //  Find existing product
    const existingProduct = await ProductImage.findByPk(id);
    if (!existingProduct) {
      return next(new ErrorHandler("Product not found", 404));
    }

    //  Validate campaign exists and check authorization
    const campaign = await Campaign.findByPk(existingProduct.campaignID);
    if (!campaign) {
      return next(new ErrorHandler("Campaign not found", 404));
    }

    if (campaign.createdBy !== req.user.id) {
      await transaction.rollback();
      return next(new ErrorHandler("Unauthorized access", 403));
    }

    //  Update object to store changes
    const updates = {};

     // Add fields to updates object if they exist in request
     if (productName) {
      updates.productName = productName;
    }

    if (imageBaseUrl) {
      updates.imageBaseUrl = imageBaseUrl;
    }

    if (vr_exterior) {
      updates.vr_exterior = vr_exterior;
    }

    if (vr_interior) {
      updates.vr_interior = vr_interior;
    }

    // Update the product with new data
    const updatedProduct = await existingProduct.update(updates, {
      transaction,
    });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: updatedProduct,
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = {
  uploadProductImages,
  getProductImagesByCampaign,
  getProductImageById,
  updateProductImages,
};
