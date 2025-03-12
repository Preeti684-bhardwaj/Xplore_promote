const db = require("../../dbConfig/dbConfig.js");
const ChatBotConfig = db.chatBotConfig;
const Campaign = db.campaigns;
const ErrorHandler = require("../../utils/ErrorHandler.js");
const asyncHandler = require("../../utils/asyncHandler.js");
const { uploadFile, deleteFile } = require("../../utils/cdnImplementation.js");
const fs = require("fs");
const path = require("path");
const os = require("os");
// const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  FileState,
  GoogleAICacheManager,
  GoogleAIFileManager,
} = require("@google/generative-ai/server");

// create configuration
const createChatbotConfig = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    //{name,api_key,otherDetails,json_file,base_prompt,model_provider}
    const { name, api_key, provider } = req.body;
    const userId = req.user.id;

    // Validate required parameters
    if (!api_key || !provider || !name) {
      await transaction.rollback();
      return next(new ErrorHandler("missing required field", 400));
    }

    // Check if campaign exists
    const existingConfig = await ChatBotConfig.findOne(
     {where:{ name: name, api_key: api_key, userId: userId }},
      { transaction }
    );
    if (existingConfig) {
      await transaction.rollback();
      return next(new ErrorHandler(`configuration already exist`, 409));
    }

    // Route to the appropriate provider handler
    let newConfig;
    try {
      if (provider === "predibase") {
        newConfig = await handlePredibaseConfig(
          req,
          name,
          provider,
          api_key,
          userId,
          transaction
        );
      } else if (provider === "gemini") {
        newConfig = await handleGeminiConfig(req, name,provider, api_key, userId, transaction);
      } else {
        await transaction.rollback();
        return next(
          new ErrorHandler(`Unsupported chatbot provider: ${provider}`, 400)
        );
      }
    } catch (handlerError) {
      // The handler functions now include their own cleanup
      await transaction.rollback();
      return next(new ErrorHandler(handlerError.message, handlerError.statusCode || 500));
    }

    // If we got this far without a newConfig, something went wrong
    if (!newConfig) {
      await transaction.rollback();
      return next(
        new ErrorHandler("Failed to create chatbot configuration", 500)
      );
    }

    await transaction.commit();
    return res.status(201).json({
      success: true,
      message: `${provider} ChatBot Configuration created successfully`,
      config: {
        id: newConfig.id,
        name: newConfig.name,
        provider: newConfig.provider,
        userId: newConfig.userId,
        createdAt: newConfig.createdAt,
        updatedAt: newConfig.updatedAt,
      },
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

// Handle Predibase-specific configuration
const handlePredibaseConfig = async (req, name,provider, api_key, userId, transaction) => {
  // Variables to track uploaded files for potential cleanup
  let csvUploadUrl = null;
  let jsonUploadUrl = null;
  
  try {
    // Validate predibase requires both CSV and JSON files
    if (!req.files || req.files.length !== 2) {
      throw new ErrorHandler("Predibase requires both CSV and JSON files", 400);
    }
    
    const {
      adapter_source,
      max_new_tokens,
      adapter_id,
      tenant_id,
      base_prompt,
    } = req.body;
    
    if (!adapter_source || !max_new_tokens || !adapter_id || !tenant_id || !base_prompt) {
      throw new ErrorHandler("missing required field", 400);
    }
    
    // Find CSV and JSON files
    let csvFile = null;
    let jsonFile = null;
    for (const file of req.files) {
      if (file.mimetype === "text/csv" || file.originalname.toLowerCase().endsWith(".csv")) {
        csvFile = file;
      } else if (file.mimetype === "application/json" || file.originalname.toLowerCase().endsWith(".json")) {
        jsonFile = file;
      }
    }

    if (!csvFile || !jsonFile) {
      throw new ErrorHandler("Both CSV and JSON files are required for Predibase", 400);
    }

    // Upload files
    const csvUpload = await uploadFile({
      buffer: csvFile.buffer,
      originalname: csvFile.originalname,
      mimetype: csvFile.mimetype,
    });
    csvUploadUrl = csvUpload.url;

    const jsonUpload = await uploadFile({
      buffer: jsonFile.buffer,
      originalname: jsonFile.originalname,
      mimetype: jsonFile.mimetype,
    });
    jsonUploadUrl = jsonUpload.url;

    // Initialize config data
    const configData = {
      api_key,
      name: name,
      userId: userId,
      json_file: jsonUploadUrl,
      provider: provider,
      base_prompt: base_prompt,
      otherDetails: {
        csv_file: csvUploadUrl,
        adapter_source: adapter_source,
        max_new_tokens: max_new_tokens,
        adapter_id: adapter_id,
        tenant_id: tenant_id,
      },
    };

    // Create the ChatBotConfig
    return await ChatBotConfig.create(configData, { transaction });
    
  } catch (error) {
    // Clean up any uploaded files if error occurs
    try {
      if (csvUploadUrl) {
        const csvFileName = csvUploadUrl.split('/').pop();
        await deleteFile(csvFileName);
      }
      
      if (jsonUploadUrl) {
        const jsonFileName = jsonUploadUrl.split('/').pop();
        await deleteFile(jsonFileName);
      }
    } catch (cleanupError) {
      console.error("Error during file cleanup:", cleanupError);
    }
    
    throw error; // Re-throw the original error after cleanup
  }
};

// Handle Gemini-specific configuration
const handleGeminiConfig = async (req, name, provider,api_key, userId, transaction) => {
  // Variables to track uploaded files for potential cleanup
  let geminiCsvUploadUrl = null;
  let geminiJsonUploadUrl = null;
  let tempFilePath = null;
  let googleCacheName = null;
  
  try {
    const { base_prompt } = req.body;

    // Check required fields
    if (!base_prompt) {
      throw new ErrorHandler("base_prompt is required for Gemini", 400);
    }
    
    // Find CSV and JSON files
    let geminiCsvFile = null;
    let geminiJsonFile = null;
    for (const file of req.files) {
      if (file.mimetype === "text/csv" || file.originalname.toLowerCase().endsWith(".csv")) {
        geminiCsvFile = file;
      } else if (file.mimetype === "application/json" || file.originalname.toLowerCase().endsWith(".json")) {
        geminiJsonFile = file;
      }
    }

    if (!geminiCsvFile || !geminiJsonFile) {
      throw new ErrorHandler("Both CSV and JSON files are required for Gemini", 400);
    }

    // Upload files
    const geminiCsvUpload = await uploadFile({
      buffer: geminiCsvFile.buffer,
      originalname: geminiCsvFile.originalname,
      mimetype: geminiCsvFile.mimetype,
    });
    geminiCsvUploadUrl = geminiCsvUpload.url;

    const geminiJsonUpload = await uploadFile({
      buffer: geminiJsonFile.buffer,
      originalname: geminiJsonFile.originalname,
      mimetype: geminiJsonFile.mimetype,
    });
    geminiJsonUploadUrl = geminiJsonUpload.url;

    //Create a temporary file with the CSV data
    const tempDir = os.tmpdir();
    tempFilePath = path.join(tempDir, `${Date.now()}_${geminiCsvFile.originalname}`);

    //Write the buffer to the temp file
    fs.writeFileSync(tempFilePath, geminiCsvFile.buffer);

    //Initialize the file manager with the API key
    const fileManager = new GoogleAIFileManager(api_key);

    //Upload the file using the path (not the buffer)
    console.log(`Uploading temp file from: ${tempFilePath}`);
    const fileResult = await fileManager.uploadFile(tempFilePath, {
      displayName: name,
      mimeType: geminiCsvFile.mimetype,
    });
    
    // Track Google file info for potential cleanup
    googleFileId = fileResult.file.name;

    // Clean up the temp file
    fs.unlinkSync(tempFilePath);
    tempFilePath = null;
    
    // Log success for debugging
    console.log("Google AI File upload result:", fileResult);

    // Extract file details
    const { name: fileName, uri } = fileResult.file;

    // Poll getFile() to check file state
    let file = await fileManager.getFile(fileName);
    while (file.state === FileState.PROCESSING) {
      console.log("Waiting for dataset processing...");
      // Sleep for 2 seconds
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      file = await fileManager.getFile(name);
    }

    console.log(`Dataset processing complete: ${uri}`);

    const cacheManager = new GoogleAICacheManager(api_key);
    console.log(cacheManager);
    const displayName = name;
    const model = "models/gemini-1.5-flash-001";
    const systemInstruction = base_prompt;
    let ttlSeconds = 86400;
    
    // Create cached content
    const cache = await cacheManager.create({
      model,
      displayName,
      systemInstruction,
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                mimeType: fileResult.file.mimeType,
                fileUri: fileResult.file.uri,
              },
            },
          ],
        },
      ],
      ttlSeconds,
    });
    googleCacheName = cache.name;
    console.log("Cache created:", googleCacheName);

    // Initialize config data
    const configData = {
      api_key,
      userId: userId,
      name,
      base_prompt,
      json_file: geminiJsonUploadUrl,
      provider: provider,
      otherDetails: {
        cache_name: googleCacheName,
        csv_file_id: fileName,
        csv_file: geminiCsvUploadUrl,
      },
    };

    // Create the ChatBotConfig
    return await ChatBotConfig.create(configData, { transaction });
    
  } catch (error) {
    console.error("Gemini configuration error:", error);
    
    // Cleanup resources in case of error
    try {
      // Clean up temp file if it exists
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      
      // Clean up uploaded files
      if (geminiCsvUploadUrl) {
        const csvFileName = geminiCsvUploadUrl.split('/').pop();
        await deleteFile(csvFileName);
      }
      
      if (geminiJsonUploadUrl) {
        const jsonFileName = geminiJsonUploadUrl.split('/').pop();
        await deleteFile(jsonFileName);
      }
      
    } catch (cleanupError) {
      console.error("Error during resource cleanup:", cleanupError);
    }
    
    throw new ErrorHandler(`Gemini configuration failed: ${error.message}`, 500);
  }
};

// get json question
const getJsonQuestion = asyncHandler(async (req, res, next) => {
  try {
    const { campaignId } = req.query;
    if (!campaignId) {
      return next(new ErrorHandler("Campaign ID is required", 400));
    }

    const chatbotData = await ChatBotConfig.findOne({
      where: {
        campaignId: campaignId,
      },
      attributes: ["id", "campaignId", "json_file"],
    });

    if (!chatbotData) {
      return next(
        new ErrorHandler(`Data not found for campaignId ${campaignId}`, 404)
      );
    }

    // Fetch the JSON data from the URL
    const jsonFileUrl = chatbotData.json_file;

    try {
      const response = await fetch(jsonFileUrl);

      if (!response.ok) {
        return next(
          new ErrorHandler(
            `Failed to fetch JSON data: ${response.statusText}`,
            500
          )
        );
      }

      const jsonData = await response.json();

      // Extract only the questions from the JSON data
      // const questionsOnly = jsonData.map((item) => item.question);

      return res.status(200).json({
        success: true,
        data: {
          id: chatbotData.id,
          campaignId: chatbotData.campaignId,
          questions: jsonData.questions,
        },
      });
    } catch (fetchError) {
      return next(
        new ErrorHandler(`Error fetching JSON data: ${fetchError.message}`, 500)
      );
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// get csv file for a campaign id
// const getCsvFile = asyncHandler(async (req, res, next) => {
//   try {
//     const { campaignId, api_key } = req.query;
//     if (!campaignId || !api_key) {
//       return next(
//         new ErrorHandler("Campaign ID and API key are required", 400)
//       );
//     }

//     const chatbotData = await ChatBotConfig.findOne({
//       where: {
//         api_key: api_key,
//         campaignId: campaignId,
//       },
//       attributes: ["id", "campaignId", "otherDetails"],
//     });

//     if (!chatbotData) {
//       return next(
//         new ErrorHandler(`Data not found for campaignId ${campaignId}`, 404)
//       );
//     }

//     // Extract CSV file from otherDetails
//     const csvFile = chatbotData.otherDetails?.csv_file;

//     return res.status(200).json({
//       success: true,
//       data: {
//         id: chatbotData.id,
//         campaignId: chatbotData.campaignId,
//         csv_file: csvFile,
//       },
//     });
//   } catch (error) {
//     return next(new ErrorHandler(error.message, 500));
//   }
// });

// update config data for proxy chatbot api
const updateChatbotConfig = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  let uploadedJsonUrl = null;
  let oldJsonFileName = null;
  
  try {
    const { id } = req.params;
    const { base_prompt } = req.body;
    const userId = req.user.id;
    
    // Find existing configuration for the user
    const existingConfig = await ChatBotConfig.findOne(
      {
        where: { id,userId },
      },
      { transaction }
    );

    if (!existingConfig) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "No configuration found for provided API key for user",
          404
        )
      );
    }

    // Initialize update data with base_prompt
    const updateData = {
      base_prompt: base_prompt || existingConfig.base_prompt,
    };

    // Handle JSON file upload
    if (req.files && req.files.length > 0) {
      let jsonFile = null;
      for (const file of req.files) {
        if (
          file.mimetype === "application/json" ||
          file.originalname.toLowerCase().endsWith(".json")
        ) {
          jsonFile = file;
          break;
        }
      }

      if (jsonFile) {
        // Store the old file name for deletion after successful update
        if (existingConfig.json_file) {
          oldJsonFileName = existingConfig.json_file.split('/').pop();
        }
        
        // Upload the new file
        const jsonUpload = await uploadFile({
          buffer: jsonFile.buffer,
          originalname: jsonFile.originalname,
          mimetype: jsonFile.mimetype,
        });
        
        // Store the new file URL for potential cleanup in case of error
        uploadedJsonUrl = jsonUpload.url;
        
        // Update the json_file field with the file URL
        updateData.json_file = uploadedJsonUrl;
      }
    }

    // Update the configuration
    const updatedConfig = await existingConfig.update(updateData, {
      transaction
    });

    await transaction.commit();
    
    // After successful transaction, delete the old file if it was replaced
    if (oldJsonFileName) {
      try {
        await deleteFile(oldJsonFileName);
        console.log(`Successfully deleted old file: ${oldJsonFileName}`);
      } catch (deleteError) {
        // Log the error but don't fail the request since the update was successful
        console.error(`Failed to delete old file ${oldJsonFileName}:`, deleteError);
      }
    }
    
    return res.status(200).json({
      success: true,
      message: "Configuration updated successfully",
      config: updatedConfig,
    });
  } catch (error) {
    await transaction.rollback();
    
    // Clean up any newly uploaded files if error occurs
    if (uploadedJsonUrl) {
      try {
        const jsonFileName = uploadedJsonUrl.split('/').pop();
        await deleteFile(jsonFileName);
        console.log(`Cleaned up new file after error: ${jsonFileName}`);
      } catch (cleanupError) {
        console.error("Error during file cleanup:", cleanupError);
      }
    }
    
    return next(new ErrorHandler(error.message, 500));
  }
});

// get all configuration of user
const getAllChatbotConfig = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Find all chatbot configurations for the user
    const userConfigurations = await db.chatBotConfig.findAll({
      where: { userId },
      attributes: [
        'id', 
        'name', 
        'api_key', 
        'base_prompt', 
        'json_file', 
        'model_provider',
        'otherDetails',
        'createdAt',
        'updatedAt'
      ],
      order: [['createdAt', 'DESC']] // Optional: Orders by most recently created first
    });

    if (!userConfigurations || userConfigurations.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No configurations found for this user",
        configurations: []
      });
    }

    return res.status(200).json({
      success: true,
      count: userConfigurations.length,
      configurations: userConfigurations
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// assign chatbot configuration to campaign
const assignChatbotToCampaign = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { chatbotConfigId, campaignId } = req.query;
    const userId = req.user.id;

    // Validate required parameters
    if (!chatbotConfigId || !campaignId) {
      await transaction.rollback();
      return next(new ErrorHandler("Chatbot config ID and campaign ID are required", 400));
    }

    // Check if the campaign exists and belongs to the user
    const campaign = await Campaign.findOne({
      where: {
        campaignID: campaignId,
      },
      transaction
    });

    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign not found", 404));
    }

    if(campaign.createdBy !==userId){
      await transaction.rollback();
      return next(new ErrorHandler("Unauthorized access", 403));
    }
    // Check if the chatbot config exists and belongs to the user
    const chatbotConfig = await ChatBotConfig.findOne({
      where: {
        id: chatbotConfigId,
        userId: userId
      },
      transaction
    });

    if (!chatbotConfig) {
      await transaction.rollback();
      return next(new ErrorHandler("Chatbot configuration not found or you don't have permission to access it", 404));
    }

    // Check if another campaign is already using this chatbot config
    const existingAssignment = await ChatBotConfig.findOne({
      where: {
        id: chatbotConfigId,
        campaignId: { [db.Sequelize.Op.ne]: null, [db.Sequelize.Op.ne]: campaignId }
      },
      transaction
    });

    if (existingAssignment) {
      await transaction.rollback();
      return next(new ErrorHandler("This chatbot configuration is already assigned to another campaign", 409));
    }

    // Check if campaign already has a different chatbot configuration
    const existingChatbot = await ChatBotConfig.findOne({
      where: {
        campaignId: campaignId,
        id: { [db.Sequelize.Op.ne]: chatbotConfigId }
      },
      transaction
    });

    if (existingChatbot) {
      // If updating from one config to another, unassign the old one
      await existingChatbot.update({ campaignId: null }, { transaction });
    }

    // Assign the chatbot to the campaign
    await chatbotConfig.update({ campaignId: campaignId }, { transaction });

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: "Chatbot configuration successfully assigned to campaign",
      data: {
        campaignId: campaignId,
        chatbotConfigId: chatbotConfigId,
        chatbotName: chatbotConfig.name,
        provider: chatbotConfig.model_provider
      }
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

// remove chatbot configuration to campaign
const removeChatbotFromCampaign = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { campaignId } = req.query;
    const userId = req.user.id;

    // Validate required parameters
    if (!campaignId) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign ID is required", 400));
    }

    // Check if the campaign exists and belongs to the user
    const campaign = await Campaign.findOne({
      where: {
        campaignID: campaignId,
        createdBy: userId
      },
      transaction
    });

    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign not found or you don't have permission to access it", 404));
    }

    // Find the chatbot assigned to this campaign
    const chatbotConfig = await ChatBotConfig.findOne({
      where: {
        campaignId: campaignId,
        userId: userId
      },
      transaction
    });

    if (!chatbotConfig) {
      await transaction.rollback();
      return next(new ErrorHandler("No chatbot configuration is assigned to this campaign", 404));
    }

    // Remove the campaign association from the chatbot
    await chatbotConfig.update({ campaignId: null }, { transaction });

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: "Chatbot configuration successfully removed from campaign",
      data: {
        campaignId: campaignId,
        chatbotConfigId: chatbotConfig.id
      }
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = {
  // getCsvFile,
  getJsonQuestion,
  updateChatbotConfig,
  createChatbotConfig,
  getAllChatbotConfig,
  assignChatbotToCampaign,
  removeChatbotFromCampaign
};
