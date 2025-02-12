const db = require("../dbConfig/dbConfig.js");
const AssetStore = db.assets;
const {uploadFile,deleteFile,listFiles} = require("../utils/cdnImplementation.js");
const {validateFiles} = require("../validators/campaignValidations.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

//-------------- Upload content to CDN and store metadata in AssetStore-----------------------------
const uploadContent = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new ErrorHandler("User ID is required", 400));
    }

    // Validate file request
    const fileError = validateFiles(req.files);
    if (fileError) {
      return next(new ErrorHandler(fileError, 400));
    }

    // Initialize arrays for tracking results
    const uploadResults = [];

    // First, ensure AssetStore exists for the user
    let assetStore = await AssetStore.findOne({ 
      where: { userId: userId } 
    });

    // If no AssetStore exists, create one with empty assetData
    if (!assetStore) {
      assetStore = await AssetStore.create({
        userId: userId,
        assetData: []
      });
    }

    // Parse existing assetData
    let assetData = [];
    try {
      assetData = typeof assetStore.assetData === "string" 
        ? JSON.parse(assetStore.assetData) 
        : assetStore.assetData || [];
    } catch (parseError) {
      console.error("Error parsing assetData:", parseError);
      assetData = [];
    }

    // Process each file
    for (const file of req.files) {
      try {
        // Upload to CDN
        const cdnResult = await uploadFile(file);

        // Prepare new asset data
        const newAssetData = {
          fileName: cdnResult.filename,
          originalName: cdnResult.originalName,
          fileType: cdnResult.type,
          fileSize: cdnResult.size,
          cdnUrl: cdnResult.url,
          uploadedAt: new Date().toISOString(),
        };

        // Add new asset to arrays
        assetData.push(newAssetData);
        uploadResults.push(newAssetData);
      } catch (uploadError) {
        console.error(`Error uploading file ${file.originalname}:`, uploadError);
        // Continue with other files if one fails
        continue;
      }
    }

    // Update AssetStore with new data
    try {
      await AssetStore.update(
        { assetData: assetData },
        { 
          where: { userId: userId },
          returning: true // Get the updated record
        }
      );

      // Verify the update
      const verifiedStore = await AssetStore.findOne({
        where: { userId: userId }
      });

      if (!verifiedStore) {
        throw new Error("Failed to verify AssetStore update");
      }

      return res.status(200).json({
        success: true,
        message: `Successfully uploaded ${uploadResults.length} files`,
        data: {
          newUploads: uploadResults,
          totalAssets: assetData.length,
          assetStoreId: verifiedStore.id
        }
      });

    } catch (updateError) {
      console.error("Error updating AssetStore:", updateError);
      return next(new ErrorHandler("Failed to update asset store", 500));
    }

  } catch (error) {
    console.error("Upload Content Error:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

//-----------------upload to files CDN------------------------------------------
const uploadImage = asyncHandler(async (req, res, next) => {
  try {
    // Validate file request
    if (!req.files || req.files.length === 0) {
      return next(new ErrorHandler("No files uploaded", 400));
    }

    // Validate file type and size if needed
    const fileError = validateFiles(req.files);
    if (fileError) {
      return next(new ErrorHandler(fileError, 400));
    }

    // Array to store upload results
    const uploadResults = [];

    // Process each uploaded file
    for (const file of req.files) {
      try {
        // Upload to CDN
        const cdnResult = await uploadFile(file);

        // Prepare upload result
        const uploadData = {
          fileName: cdnResult.filename,
          originalName: cdnResult.originalName,
          fileType: cdnResult.type,
          fileSize: cdnResult.size,
          cdnUrl: cdnResult.url,
          uploadedAt: new Date().toISOString(),
        };

        uploadResults.push(uploadData);
      } catch (uploadError) {
        console.error(`Error uploading file ${file.originalname}:`, uploadError);
        // Optional: you can choose to stop processing or continue
        return next(new ErrorHandler(`Failed to upload ${file.originalname}`, 500));
      }
    }

    // Respond with upload results
    return res.status(200).json({
      success: true,
      message: `Successfully uploaded ${uploadResults.length} file(s)`,
      data: uploadResults
    });

  } catch (error) {
    console.error("Upload Content Error:", error);
    return next(new ErrorHandler("Upload failed", 500));
  }
});

//-------------------Get assetstore data-----------------------------------
const getUploadedAssets = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user?.id;

    // Validate user context
    if (!userId) {
      return next(new ErrorHandler("Unauthenticated", 401));
    }

    // Fetch the AssetStore record for the user
    const assetStore = await AssetStore.findOne({ where: { userId: userId } });

    // Check if the AssetStore record exists
    if (!assetStore) {
      return next(new ErrorHandler("AssetStore not found", 404));
    }

    // Parse the assetData if it's a string, otherwise use it directly
    const assetData =
      typeof assetStore.assetData === "string"
        ? JSON.parse(assetStore.assetData)
        : assetStore.assetData;

    // Check if the assetData is an array
    if (!Array.isArray(assetData)) {
      return next(new ErrorHandler("Invalid asset data format", 500));
    }
    
    return res.status(200).json({
      success: true,
      data: assetData,
    });
  } catch (error) {
    console.error("Get Uploaded Assets Error:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

//------------Delete content from CDN and AssetStore--------------------------
const deleteContent = asyncHandler(async (req, res,next) => {
  try {
    const { fileName } = req.query;
    const userId = req.user?.id; 

    // Validate fileName
    if (!fileName) {
      return next(new ErrorHandler("File name is required in query parameters",400));
    }

    // Find the asset store for the user
    const assetStore = await AssetStore.findOne({
      where: { userId: userId }
    });

    if (!assetStore) {
     return next(new ErrorHandler(`No assets found for user ${userId}`,404));
    }

    // Get current assetData array
    let assetData =
      typeof assetStore.assetData === "string"
        ? JSON.parse(assetStore.assetData)
        : assetStore.assetData;

    // Find the index of the file to delete
    const fileIndex = assetData.findIndex(
      (asset) => asset.fileName === fileName
    );

    if (fileIndex === -1) {
      return next(new ErrorHandler( "File not found in user's assets",404));
    }

    try {
      // Delete from CDN first
      await deleteFile(fileName);

      // If CDN deletion successful, remove from assetData array
      assetData.splice(fileIndex, 1);

      // Update the database with new assetData
      await AssetStore.update(
        { assetData: assetData },
        { where: { userId: userId } }
      );

      // If assetData is empty after deletion, you might want to delete the whole record
      if (assetData.length === 0) {
        await assetStore.destroy();
      }

      return res.status(200).json({
        success: true,
        message: "File deleted successfully from both CDN and database",
        remainingAssets: assetData,
      });
    } catch (error) {
      // If CDN deletion fails, don't update database
     return next(new ErrorHandler(`CDN deletion failed: ${error.message}`,500));
    }
  } catch (error) {
    console.error("Delete Content Error:", error);
    return next(new ErrorHandler(`Deletion failed: ${error.message}`,500));
  }
});

//------------Delete content from CDN -----------------------------------
const deleteContentCdn = asyncHandler(async (req, res,next) => {
  try {
    const { fileName } = req.query;

    // Validate fileName
    if (!fileName) {
      return next(new ErrorHandler( "File name is required in query parameters",400));
    }

    try {
      // Delete from CDN first
      await deleteFile(fileName);

      return res.status(200).json({
        success: true,
        message: "File deleted successfully from CDN",
      });
    } catch (error) {
      // If CDN deletion fails, don't update database
     return next(new ErrorHandler(`CDN deletion failed: ${error.message}`,500));
    }
  } catch (error) {
    console.error("Delete Content Error:", error);
    return next(new ErrorHandler(`Deletion failed: ${error.message}`,500));
  }
});

//------------get listing of files from CDN--------------------------------
const getFiles = asyncHandler(async (req, res,next) => {
  try {
    const cdnFiles = await listFiles();

    return res.status(200).json({
      success: true,
      data: {
        files: cdnFiles,
      },
    });
  } catch (error) {
    console.error("Get Files Error:", error);
    return next(new ErrorHandler(`Failed to retrieve files: ${error.message}`,500));
  }
});

module.exports = {
  uploadContent,
  getUploadedAssets,
  deleteContentCdn,
  deleteContent,
  uploadImage,
  getFiles
};
