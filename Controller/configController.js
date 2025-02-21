const db = require("../dbConfig/dbConfig.js");
const PredibaseConfig = db.predibaseConfig;
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

    const { api_token, campaignID } = req.body;
    if (!api_token || !campaignID) {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    const campaign = await Campaign.findByPk(campaignID, { transaction });
    if (!campaign) {
      await transaction.rollback();
      return next(
        new ErrorHandler(`Campaign with ID ${campaignID} not found`, 404)
      );
    }

    const predibaseData = await PredibaseConfig.findOne({
      where: { campaignId: campaignID },
      transaction,
    });
    if (predibaseData) {
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

    const newConfig = await PredibaseConfig.create(
      {
        api_token,
        csv_file: csvUpload.url,
        json_file: jsonUpload.url,
        campaignId: campaignID,
      },
      { transaction }
    );

    await transaction.commit();
    return res.status(201).json({
      success: true,
      message: "Predibase Configuration created",
      config: {
        id: newConfig.id,
        adapter_source: newConfig.adapter_source,
        max_new_tokens: newConfig.max_new_tokens,
        api_token: newConfig.api_token,
        csv_file: newConfig.csv_file,
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

// get csv file for a campaign id
const getCsvFile = asyncHandler(async (req, res, next) => {
  try {
    const { campaignId, api_token } = req.query;
    if (!campaignId || !api_token) {
    }
    const predibaseData = await PredibaseConfig.findOne({
      where: {
        api_token: api_token,
        campaignId: campaignId,
      },
      attributes: {
        exclude: ["tenant_id", "deployment_name","adapter_id", "base_prompt","api_token","adapter_source","adapter_name","max_new_tokens","json_file"],
      },
    });
    if (!predibaseData) {
      return next(
        new ErrorHandler(`Data not found for campaignId ${campaignId}`, 404)
      );
    }
    return res.status(200).json({ success: true, data: predibaseData });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});
const getJsonFile = asyncHandler(async (req, res, next) => {
  try {
    const { campaignId, api_token } = req.query;
    if (!campaignId || !api_token) {
    }
    const predibaseData = await PredibaseConfig.findOne({
      where: {
        api_token: api_token,
        campaignId: campaignId,
      },
      attributes: {
        exclude: ["tenant_id", "deployment_name","csv_file" ,"adapter_id", "base_prompt","api_token","adapter_source","adapter_name","max_new_tokens","csv_file"],
      },
    });
    if (!predibaseData) {
      return next(
        new ErrorHandler(`Data not found for campaignId ${campaignId}`, 404)
      );
    }
    return res.status(200).json({ success: true, data: predibaseData });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});


// update config data for proxy predibase api
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
      api_token,
      adapter_name,
    } = req.body;

    // Basic validation
    if (!api_token) {
      await transaction.rollback();
      return next(new ErrorHandler("API token is required", 400));
    }

    if (!campaignId) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign ID is required", 400));
    }

    // Find existing configuration for the campaign
    const existingTokenConfig = await PredibaseConfig.findOne(
      {
        where: { api_token, campaignId },
      },
      { transaction }
    );

    if (!existingTokenConfig) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "No configuration found for provided API token and campaign ID",
          404
        )
      );
    }

    // If adapter_name is provided, check for uniqueness across different campaigns
    if (adapter_name) {
      const existingAdapterName = await PredibaseConfig.findOne(
        {
          where: {
            adapter_name,
            api_token,
            campaignId: {
              [db.Sequelize.Op.ne]: campaignId, // Look for adapter_name in other campaigns
            },
          },
        },
        { transaction }
      );

      if (existingAdapterName) {
        await transaction.rollback();
        return next(
          new ErrorHandler(
            "Adapter name already exists for another campaign. Must be unique across campaigns.",
            409
          )
        );
      }
    }

    // Check if this is the first update for this configuration
    const isFirstUpdate =
      !existingTokenConfig.adapter_name &&
      !existingTokenConfig.deployment_name &&
      !existingTokenConfig.adapter_id &&
      !existingTokenConfig.tenant_id &&
      !existingTokenConfig.base_prompt;

    // If not first update and trying to change adapter_name, prevent it
    if (
      !isFirstUpdate &&
      adapter_name &&
      existingTokenConfig.adapter_name &&
      adapter_name !== existingTokenConfig.adapter_name
    ) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "Cannot change adapter name once set for a campaign",
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

      const missingFields = requiredFields.filter((field) => !req.body[field]);

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

    // Prepare update data
    const updateData = {
      tenant_id: tenant_id || existingTokenConfig.tenant_id,
      deployment_name: deployment_name || existingTokenConfig.deployment_name,
      adapter_name: adapter_name || existingTokenConfig.adapter_name,
      base_prompt: base_prompt || existingTokenConfig.base_prompt,
      max_new_tokens: max_new_tokens || existingTokenConfig.max_new_tokens,
      adapter_source: adapter_source || existingTokenConfig.adapter_source,
      adapter_id: adapter_id || existingTokenConfig.adapter_id,
    };

    // Update the configuration
    const updatedConfig = await existingTokenConfig.update(updateData, {
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
    const { adapter_name, adapter_id, campaignID } = req.body;

    // Validate required fields
    if (!adapter_name || !adapter_id || !campaignID) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "adapter_name, adapter_id, and campaignID are all required",
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

    // Find existing config with the provided adapter_name and campaignID
    const existingConfig = await PredibaseConfig.findOne({
      where: { 
        adapter_name,
        campaignId: campaignID
      },
      transaction,
    });

    if (!existingConfig) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          `No configuration found with adapter_name '${adapter_name}' for campaign ID ${campaignID}`,
          404
        )
      );
    }

    // Check if new adapter_id is already in use
    const existingAdapterId = await PredibaseConfig.findOne({
      where: {
        adapter_id,
        campaignId: {
          [db.Sequelize.Op.ne]: campaignID // Not equal to current campaign
        }
      },
      transaction,
    });

    if (existingAdapterId) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          `Adapter ID '${adapter_id}' is already in use by another campaign`,
          409
        )
      );
    }

    // If it's the same adapter_id, no need to update
    if (existingConfig.adapter_id === adapter_id) {
      await transaction.rollback();
      return res.status(200).json({
        success: true,
        message: "No update needed - adapter_id is already set to the requested value",
        config: {
          id: existingConfig.id,
          adapter_name: existingConfig.adapter_name,
          adapter_id: existingConfig.adapter_id,
          campaignId: existingConfig.campaignId,
          updatedAt: existingConfig.updatedAt
        }
      });
    }

    // Update the adapter_id
    const updatedConfig = await existingConfig.update(
      { adapter_id },
      { transaction }
    );

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: "Adapter ID updated successfully",
      config: {
        id: updatedConfig.id,
        adapter_name: updatedConfig.adapter_name,
        adapter_id: updatedConfig.adapter_id,
        campaignId: updatedConfig.campaignId,
        updatedAt: updatedConfig.updatedAt
      }
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
};
