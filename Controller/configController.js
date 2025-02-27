const db = require("../dbConfig/dbConfig.js");
const ChatBotConfig = db.chatBotConfig;
const Campaign = db.campaigns;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");
const { uploadFile, deleteFile } = require("../utils/cdnImplementation.js");

// upload csv file
const uploadPredibaseConfig = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    if (!req.files || req.files.length === 0) {
      return next(new ErrorHandler("Both CSV and JSON files are required", 400));
    }

    if (req.files.length !== 2) {
      return next(new ErrorHandler("Exactly two files (1 CSV and 1 JSON) are required", 400));
    }

    const { api_key, campaignID } = req.body;
    if (!api_key || !campaignID) {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    const campaign = await Campaign.findByPk(campaignID, { transaction });
    if (!campaign) {
      await transaction.rollback();
      return next(
        new ErrorHandler(`Campaign with ID ${campaignID} not found`, 404)
      );
    }

    const chatbotData = await ChatBotConfig.findOne({
      where: { campaignId: campaignID },
      transaction,
    });
    if (chatbotData) {
      await transaction.rollback();
      return next(
        new ErrorHandler(`Data already exists for campaignId ${campaignID}`, 409)
      );
    }

    // Find CSV and JSON files
    let csvFile = null;
    let jsonFile = null;

    for (const file of req.files) {
      if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
        if (csvFile) {
          await transaction.rollback();
          return next(new ErrorHandler("Multiple CSV files detected. Only one CSV file is allowed", 400));
        }
        csvFile = file;
      } else if (file.mimetype === 'application/json' || file.originalname.toLowerCase().endsWith('.json')) {
        if (jsonFile) {
          await transaction.rollback();
          return next(new ErrorHandler("Multiple JSON files detected. Only one JSON file is allowed", 400));
        }
        jsonFile = file;
      }
    }

    if (!csvFile || !jsonFile) {
      await transaction.rollback();
      return next(new ErrorHandler("Both CSV and JSON files are required", 400));
    }

    // Upload both files
    let csvUpload;
    let jsonUpload;
    try {
      csvUpload = await uploadFile({
        buffer: csvFile.buffer,
        originalname: csvFile.originalname,
        mimetype: csvFile.mimetype,
      });

      jsonUpload = await uploadFile({
        buffer: jsonFile.buffer,
        originalname: jsonFile.originalname,
        mimetype: jsonFile.mimetype,
      });
    } catch (uploadError) {
      await transaction.rollback();
      return next(new ErrorHandler(`File upload failed: ${uploadError.message}`, 500));
    }

    // Create new config with otherDetails field
    const newConfig = await ChatBotConfig.create(
      {
        api_key,
        json_file: jsonUpload.url,
        campaignId: campaignID,
        otherDetails: {
          csv_file: csvUpload.url,
          adapter_source: null,
          max_new_tokens: null,
          deployment_name: null,
          adapter_id: null,
          tenant_id: null
        }
      },
      { transaction }
    );

    await transaction.commit();
    return res.status(201).json({
      success: true,
      message: "ChatBot Configuration created",
      config: {
        id: newConfig.id,
        api_key: newConfig.api_key,
        json_file: newConfig.json_file,
        otherDetails: newConfig.otherDetails.csv_file,
        campaignId: newConfig.campaignId,
        updatedAt: newConfig.updatedAt,
        createdAt: newConfig.createdAt,
      },
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

// get csv file for a campaign id
const getCsvFile = asyncHandler(async (req, res, next) => {
  try {
    const { campaignId, api_key } = req.query;
    if (!campaignId || !api_key) {
      return next(new ErrorHandler("Campaign ID and API key are required", 400));
    }
    
    const chatbotData = await ChatBotConfig.findOne({
      where: {
        api_key: api_key,
        campaignId: campaignId,
      },
      attributes: ['id', 'campaignId', 'otherDetails'],
    });
    
    if (!chatbotData) {
      return next(
        new ErrorHandler(`Data not found for campaignId ${campaignId}`, 404)
      );
    }
    
    // Extract CSV file from otherDetails
    const csvFile = chatbotData.otherDetails?.csv_file;
    
    return res.status(200).json({ 
      success: true, 
      data: {
        id: chatbotData.id,
        campaignId: chatbotData.campaignId,
        csv_file: csvFile
      } 
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

const getJsonFile = asyncHandler(async (req, res, next) => {
  try {
    const { campaignId } = req.query;
    if (!campaignId) {
      return next(new ErrorHandler("Campaign ID and API key are required", 400));
    }
    
    const chatbotData = await ChatBotConfig.findOne({
      where: {
        campaignId: campaignId,
      },
      attributes: ['id', 'campaignId', 'json_file', 'createdAt', 'updatedAt'],
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
        return next(new ErrorHandler(`Failed to fetch JSON data: ${response.statusText}`, 500));
      }
      
      const jsonData = await response.json();
      
      return res.status(200).json({ 
        success: true, 
        data: {
          id: chatbotData.id,
          campaignId: chatbotData.campaignId,
          json_content: jsonData  
        }
      });
    } catch (fetchError) {
      return next(new ErrorHandler(`Error fetching JSON data: ${fetchError.message}`, 500));
    }
    
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// update config data for proxy chatbot api
const updateProxyConfig = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const {
      deployment_name,
      adapter_id,
      tenant_id,
      base_prompt,
      adapter_source,
      max_new_tokens,
      campaignId,
      api_key,
      adapter_name,
    } = req.body;

    // Basic validation
    if (!api_key) {
      await transaction.rollback();
      return next(new ErrorHandler("API key is required", 400));
    }

    if (!campaignId) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign ID is required", 400));
    }

    // Find existing configuration for the campaign
    const existingConfig = await ChatBotConfig.findOne(
      {
        where: { api_key, campaignId },
      },
      { transaction }
    );

    if (!existingConfig) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "No configuration found for provided API key and campaign ID",
          404
        )
      );
    }

    // If name is provided, check for uniqueness across different campaigns
    if (adapter_name) {
      const existingName = await ChatBotConfig.findOne(
        {
          where: {
            name:adapter_name,
            api_key,
            campaignId: {
              [db.Sequelize.Op.ne]: campaignId, // Look for name in other campaigns
            },
          },
        },
        { transaction }
      );

      if (existingName) {
        await transaction.rollback();
        return next(
          new ErrorHandler(
            "Name already exists for another campaign. Must be unique across campaigns.",
            409
          )
        );
      }
    }

    // Initialize otherDetails if it doesn't exist
    const otherDetails = existingConfig.otherDetails || {};

    // Check if this is the first update for this configuration
    const isFirstUpdate =
      !existingConfig.name &&
      !otherDetails.deployment_name &&
      !otherDetails.adapter_id &&
      !otherDetails.tenant_id &&
      !existingConfig.base_prompt;

    // If not first update and trying to change name, prevent it
    if (
      !isFirstUpdate &&
      adapter_name &&
      existingConfig.name &&
      adapter_name !== existingConfig.name
    ) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "Cannot change name once set for a campaign",
          400
        )
      );
    }

    // Required fields validation for first update
    if (isFirstUpdate) {
      const requiredFields = [
        "deployment_name",
        "adapter_name",
        "adapter_id",
        "tenant_id",
        "base_prompt",
      ];

      const missingFields = requiredFields.filter((field) => {
        if (field === "adapter_name") return !adapter_name;
        if (field === "base_prompt") return !base_prompt;
        return !req.body[field];
      });

      if (missingFields.length > 0) {
        await transaction.rollback();
        return next(
          new ErrorHandler(
            `Missing required fields for first update: ${missingFields.join(
              ", "
            )}`,
            400
          )
        );
      }
    }

    // Update otherDetails
    const updatedOtherDetails = {
      ...otherDetails,
      tenant_id: tenant_id || otherDetails.tenant_id,
      deployment_name: deployment_name || otherDetails.deployment_name,
      adapter_source: adapter_source || otherDetails.adapter_source,
      max_new_tokens: max_new_tokens || otherDetails.max_new_tokens,
      adapter_id: adapter_id || otherDetails.adapter_id,
      csv_file: otherDetails.csv_file || null,
    };

    // Prepare update data
    const updateData = {
      name: adapter_name || existingConfig.name,
      base_prompt: base_prompt || existingConfig.base_prompt,
      otherDetails: updatedOtherDetails
    };

    // Update the configuration
    const updatedConfig = await existingConfig.update(updateData, {
      transaction,
    });

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: "Configuration updated successfully",
      config: updatedConfig,
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

const updateAdapterName = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { name, adapter_id, campaignID } = req.body;

    // Validate required fields
    if (!name || !adapter_id || !campaignID) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "name, adapter_id, and campaignID are all required",
          400
        )
      );
    }

    // Check if campaign exists
    const campaign = await Campaign.findByPk(campaignID, { transaction });
    if (!campaign) {
      await transaction.rollback();
      return next(
        new ErrorHandler(`Campaign with ID ${campaignID} not found`, 404)
      );
    }

    // Find existing config with the provided name and campaignID
    const existingConfig = await ChatBotConfig.findOne({
      where: { 
        name,
        campaignId: campaignID
      },
      transaction,
    });

    if (!existingConfig) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          `No configuration found with name '${name}' for campaign ID ${campaignID}`,
          404
        )
      );
    }

    // Initialize otherDetails if it doesn't exist
    const otherDetails = existingConfig.otherDetails || {};

    // Check if new adapter_id is already in use
    const existingAdapterId = await ChatBotConfig.findOne({
      where: {
        campaignId: {
          [db.Sequelize.Op.ne]: campaignID // Not equal to current campaign
        }
      },
      transaction,
    });

    if (existingAdapterId && existingAdapterId.otherDetails && existingAdapterId.otherDetails.adapter_id === adapter_id) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          `Adapter ID '${adapter_id}' is already in use by another campaign`,
          409
        )
      );
    }

    // If it's the same adapter_id, no need to update
    if (otherDetails.adapter_id === adapter_id) {
      await transaction.rollback();
      return res.status(200).json({
        success: true,
        message: "No update needed - adapter_id is already set to the requested value",
        config: {
          id: existingConfig.id,
          name: existingConfig.name,
          adapter_id: otherDetails.adapter_id,
          campaignId: existingConfig.campaignId,
          updatedAt: existingConfig.updatedAt
        }
      });
    }

    // Update the adapter_id in otherDetails
    const updatedOtherDetails = {
      ...otherDetails,
      adapter_id
    };

    // Update the config
    const updatedConfig = await existingConfig.update(
      { otherDetails: updatedOtherDetails },
      { transaction }
    );

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: "Adapter ID updated successfully",
      config: {
        id: updatedConfig.id,
        name: updatedConfig.name,
        adapter_id: updatedConfig.otherDetails.adapter_id,
        campaignId: updatedConfig.campaignId,
        updatedAt: updatedConfig.updatedAt
      }
    });

  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

// gemini config upload
const uploadGeminiConfig = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    if (!req.files || req.files.length === 0) {
      return next(new ErrorHandler("JSON file is required", 400));
    }
    const { api_key, campaignID,name, base_prompt,} = req.body;
    if (!api_key || !campaignID || !name || !base_prompt) {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    const campaign = await Campaign.findByPk(campaignID, { transaction });
    if (!campaign) {
      await transaction.rollback();
      return next(
        new ErrorHandler(`Campaign with ID ${campaignID} not found`, 404)
      );
    }

    const ChatBotData = await ChatBotConfig.findOne({
      where: { campaignId: campaignID},
      transaction,
    });
    if (ChatBotData) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          `Data already exists for campaignId ${campaignID}`,
          409
        )
      );
    }

    // Find JSON files
    let jsonFile = null;
    if (
      file.mimetype === "application/json" ||
      file.originalname.toLowerCase().endsWith(".json")
    ) {
      if (jsonFile) {
        await transaction.rollback();
        return next(
          new ErrorHandler(
            "Multiple JSON files detected. Only one JSON file is allowed",
            400
          )
        );
      }
      jsonFile = file;
    }

    if (!jsonFile) {
      await transaction.rollback();
      return next(
        new ErrorHandler("JSON file is required", 400)
      );
    }

    // Upload both files
    let jsonUpload;
    try {
      jsonUpload = await uploadFile({
        buffer: jsonFile.buffer,
        originalname: jsonFile.originalname,
        mimetype: jsonFile.mimetype,
      });
    } catch (uploadError) {
      await transaction.rollback();
      return next(
        new ErrorHandler(`File upload failed: ${uploadError.message}`, 500)
      );
    }

    const newConfig = await ChatBotConfig.create(
      {
        api_key,
        name:name,
        json_file: jsonUpload.url,
        campaignId: campaignID,
        base_prompt: base_prompt 
      },
      { transaction }
    );

    await transaction.commit();
    return res.status(201).json({
      success: true,
      message: "ChatBot Configuration created",
      config: {
        id: newConfig.id,
        api_key: newConfig.api_key,
        json_file: newConfig.json_file,
        campaignId: newConfig.campaignId,
        updatedAt: newConfig.updatedAt,
        createdAt: newConfig.createdAt,
      },
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = {
  uploadPredibaseConfig,
  getCsvFile,
  getJsonFile,
  updateProxyConfig,
  updateAdapterName,
  uploadGeminiConfig
};
