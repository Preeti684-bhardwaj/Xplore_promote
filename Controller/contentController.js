const db = require("../dbConfig/dbConfig.js");
const AssetStore = db.assets;
const {getFileNameFromUrl}=require('../utils/validation.js')
const {
  uploadFile,
  deleteFile,
  listFiles,
} = require("../Controller/cdnController");

/**
 * Upload content to CDN and store metadata in AssetStore
 */
const uploadContent = async (req, res) => {
    try {
      // Validate request
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No files provided",
        });
      }
  
      const uploadResults = [];
      const userId = req.user.id; // Assuming user ID is set by verifyJWT middleware
  
      // Check if the user already has an entry in AssetStore
      let assetStore = await AssetStore.findOne({ where: { userId: userId } });
      
      // Initialize assetData array, ensuring we parse existing JSON data
      let assetData = [];
      if (assetStore && assetStore.assetData) {
        // Parse the existing assetData if it's a string, otherwise use it directly
        assetData = typeof assetStore.assetData === 'string' 
          ? JSON.parse(assetStore.assetData) 
          : assetStore.assetData;
      }
  
      console.log('Existing assetData:', assetData); // Debug log
  
      // Process each file
      for (const file of req.files) {
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
  
        // Add new asset to assetData array
        assetData.push(newAssetData);
        uploadResults.push(newAssetData);
      }
  
      console.log('Updated assetData:', assetData); // Debug log
  
      // Update or create AssetStore record
      if (assetStore) {
        // Update existing record
        await AssetStore.update(
          { assetData: assetData },
          { where: { userId: userId } }
        );
      } else {
        // Create new record for new user
        assetStore = await AssetStore.create({
          userId: userId,
          assetData: assetData,
        });
      }
  
      // Verify the update
      const updatedStore = await AssetStore.findOne({ where: { userId: userId } });
      console.log('Verified assetData after update:', updatedStore.assetData); // Debug log
  
      return res.status(200).json({
        success: true,
        message: "Files uploaded successfully",
        data: uploadResults,
        currentAssets: assetData // Include all assets in response for verification
      });
    } catch (error) {
      console.error("Upload Content Error:", error);
      return res.status(500).json({
        success: false,
        message: `Upload failed: ${error.message}`,
        error: error.stack, // Include stack trace for debugging
      });
    }
  };
  
/**
 * Delete content from CDN and AssetStore
 */
const deleteContent = async (req, res) => {
    try {
      const { fileName } = req.query;
      const userId = req.user.id; // From JWT middleware
  
      // Validate fileName
      if (!fileName) {
        return res.status(400).json({
          success: false,
          message: "File name is required in query parameters",
        });
      }
  
      // Find the asset store for the user
      const assetStore = await AssetStore.findOne({
        where: { userId: userId },
      });
  
      if (!assetStore) {
        return res.status(404).json({
          success: false,
          message: "No assets found for this user",
        });
      }
  
      // Get current assetData array
      let assetData = typeof assetStore.assetData === 'string'
        ? JSON.parse(assetStore.assetData)
        : assetStore.assetData;
  
      // Find the index of the file to delete
      const fileIndex = assetData.findIndex(asset => asset.fileName === fileName);
  
      if (fileIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "File not found in user's assets",
        });
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
          remainingAssets: assetData
        });
  
      } catch (error) {
        // If CDN deletion fails, don't update database
        throw new Error(`CDN deletion failed: ${error.message}`);
      }
  
    } catch (error) {
      console.error("Delete Content Error:", error);
      return res.status(500).json({
        success: false,
        message: `Deletion failed: ${error.message}`,
        error: error.stack
      });
    }
  };

  const deleteContentCdn = async (req, res) => {
    try {
      const { fileName } = req.query;
  
      // Validate fileName
      if (!fileName) {
        return res.status(400).json({
          success: false,
          message: "File name is required in query parameters",
        });
      }
  
      try {
        // Delete from CDN first
        await deleteFile(fileName);
  
        return res.status(200).json({
          success: true,
          message: "File deleted successfully from both CDN and database",
        });
  
      } catch (error) {
        // If CDN deletion fails, don't update database
        throw new Error(`CDN deletion failed: ${error.message}`);
      }
  
    } catch (error) {
      console.error("Delete Content Error:", error);
      return res.status(500).json({
        success: false,
        message: `Deletion failed: ${error.message}`,
        error: error.stack
      });
    }
  };
  
const getFiles = async (req, res) => {
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
    return res.status(500).json({
      success: false,
      message: `Failed to retrieve files: ${error.message}`,
    });
  }
};

module.exports = {
  uploadContent,
  deleteContent,
  getFiles,
  deleteContentCdn
};
