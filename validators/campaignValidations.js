const { uploadFiles, deleteFile } = require("../utils/cdnImplementation.js");

// Constants
const CAMPAIGN_CONSTANTS = {
  MAX_FILES: 1,
  MAX_FILE_SIZE: 25 * 1024 * 1024, // 25MB
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50,
};

// -------------file Validation------------------------------------------- 
const validateFiles = (files) => {
  // Check if files exist
  if (!files || Object.keys(files).length === 0) {
    return "At least one file upload is required";
  }

  // Convert to array if it's not already (handles both array and object inputs)
  const fileArray = Array.isArray(files) ? files : Object.values(files);

  // Check maximum number of files
  if (fileArray.length > CAMPAIGN_CONSTANTS.MAX_FILES) {
    return `Maximum ${CAMPAIGN_CONSTANTS.MAX_FILES} files allowed`;
  }

  // Check each file's size
  for (const file of fileArray) {
    if (file.size > CAMPAIGN_CONSTANTS.MAX_FILE_SIZE) {
      return `File ${file.name} exceeds size limit of ${CAMPAIGN_CONSTANTS.MAX_FILE_SIZE} bytes`;
    }
  }
  // If all validations pass, return true
  return null;
};

//---------------- File handling helpers----------------------------------
const handleFileUpload = async (files) => {
  try {
    validateFiles(files);
    const uploadedUrls = await uploadFiles(files);

    if (uploadedUrls.length === 0) {
      return {
        success: false,
        status: 500,
        message: "File upload failed",
      };
    }

    return uploadedUrls;
  } catch (error) {
    return {
      success: false,
      status: 500,
      message: "File upload failed: " + error.message,
    };
  }
};

// -------------------cleanup file---------------------------------------
const cleanupFiles = async (files) => {
  if (!files || files.length === 0) return;

  try {
    await Promise.all(files.map((file) => deleteFile(file.filename)));
    console.log(
      "Successfully cleaned up files:",
      files.map((f) => f.filename)
    );
  } catch (error) {
    console.error("File cleanup error:", error);
  }
};

// -----------------Pagination validation-----------------------------------------------
const getPagination = (page, size) => {
  const limit = +size || 10; // Default limit is 10
  const offset = (+page || 0) * limit; // Default page is 0
  return { limit, offset };
};

module.exports = {
  validateFiles,
  handleFileUpload,
  cleanupFiles,
  getPagination,
};
