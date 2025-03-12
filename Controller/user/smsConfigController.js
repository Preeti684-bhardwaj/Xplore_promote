const db = require("../../dbConfig/dbConfig.js");
const SmsConfig = db.smsConfig;
const Campaign = db.campaigns;
const ErrorHandler = require("../../utils/ErrorHandler.js");
const asyncHandler = require("../../utils/asyncHandler.js");

// create configuration
const createSmsConfig = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const {
      name,
      account_id,
      api_key,
      base_url,
      provider,
      ...otherParams // Capture any additional parameters
    } = req.body;
    const userId = req.user.id;

    // Validate required parameters
    if (
      !name ||
      !account_id ||
      !api_key ||
      !base_url ||
      !provider
    ) {
      await transaction.rollback();
      return next(new ErrorHandler("missing required field", 400));
    }
    // Check if configuration already exists
    const existingConfig = await SmsConfig.findOne(
      {
        where: {
          account_id,
          api_key,
          userId,
        },
      },
      { transaction }
    );

    if (existingConfig) {
      await transaction.rollback();
      return next(new ErrorHandler(`Configuration already exists`, 409));
    }

    // Create the new configuration with extra parameters in otherDetails
    const newConfig = await SmsConfig.create(
      {
        name,
        account_id,
        api_key,
        base_url,
        provider,
        userId,
        otherDetails: Object.keys(otherParams).length > 0 ? otherParams : null, // Store extra params in otherDetails
      },
      { transaction }
    );

    await transaction.commit();
    return res.status(201).json({
      success: true,
      message: `SMS configuration created successfully`,
      config: {
        id: newConfig.id,
        name: newConfig.name,
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
 
// update config data for SMS API
const updateSmsConfig = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { id } = req.params;
    const {
      name,
      base_url,
      ...otherParams // Capture any additional parameters
    } = req.body;
    const userId = req.user.id;

    // Find existing configuration for the user
    const existingConfig = await SmsConfig.findOne(
      {
        where: { id, userId },
      },
      { transaction }
    );

    if (!existingConfig) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "No configuration found",
          404
        )
      );
    }

    // Prepare standard fields for update
    const updateData = {
      name: name !== undefined ? name : existingConfig.name,
      base_url: base_url !== undefined ? base_url : existingConfig.base_url,
    };

    // Handle otherDetails update
    if (Object.keys(otherParams).length > 0) {
      // Merge with existing otherDetails if they exist
      const currentOtherDetails = existingConfig.otherDetails || {};
      updateData.otherDetails = {
        ...currentOtherDetails,
        ...otherParams
      };
    }

    // Update the configuration
    const updatedConfig = await existingConfig.update(updateData, {
      transaction,
    });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Configuration updated successfully",
      config: {
        id: updatedConfig.id,
        name: updatedConfig.name,
        account_id: updatedConfig.account_id,
        base_url: updatedConfig.base_url,
        provider: updatedConfig.provider,
        otherDetails: updatedConfig.otherDetails,
        updatedAt: updatedConfig.updatedAt
      }
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

// get all configuration of user
const getAllSmsConfig = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Find all SMS configurations for the user
    const userConfigurations = await SmsConfig.findAll({
      where: { userId },
      attributes: [
        "id",
        "name",
        "account_id",
        "api_key",
        "base_url",
        "provider",
        "otherDetails",
        "createdAt",
        "updatedAt",
      ],
      order: [["createdAt", "DESC"]], // Orders by most recently created first
    });

    if (!userConfigurations || userConfigurations.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No configurations found for this user",
        configurations: [],
      });
    }

    return res.status(200).json({
      success: true,
      count: userConfigurations.length,
      configurations: userConfigurations,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// get single configuration
const getConfigById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const config = await SmsConfig.findOne({
      where: { id, userId },
      attributes: [
        "id",
        "name",
        "version",
        "account_id",
        "api_key",
        "base_url",
        "provider",
        "otherDetails",
        "createdAt",
        "updatedAt",
      ]
    });

    if (!config) {
      return next(new ErrorHandler("Configuration not found", 404));
    }

    return res.status(200).json({
      success: true,
      config,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// assign SMS configuration to campaign
const assignSmsConfigToCampaign = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { configId, campaignId } = req.query;
    const userId = req.user.id;

    // Validate required parameters
    if (!configId || !campaignId) {
      await transaction.rollback();
      return next(
        new ErrorHandler("config ID and campaign ID are required", 400)
      );
    }

    // Check if the campaign exists and belongs to the user
    const campaign = await Campaign.findOne({
      where: {
        campaignID: campaignId,
      },
      transaction,
    });

    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign not found", 404));
    }

    if (campaign.createdBy !== userId) {
      await transaction.rollback();
      return next(new ErrorHandler("Unauthorized access", 403));
    }
    // Check if the SMS config exists and belongs to the user
    const config = await SmsConfig.findOne({
      where: {
        id: configId,
        userId: userId,
      },
      transaction,
    });

    if (!config) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "Configuration not found or you don't have permission to access it",
          404
        )
      );
    }

    // Check if another campaign is already using this SMS config
    const existingAssignment = await SmsConfig.findOne({
      where: {
        id: configId,
        campaignId: {
          [db.Sequelize.Op.ne]: null,
          [db.Sequelize.Op.ne]: campaignId,
        },
      },
      transaction,
    });

    if (existingAssignment) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "This SMS configuration is already assigned to another campaign",
          409
        )
      );
    }

    // Check if campaign already has a different SMS configuration
    const existingConfig = await SmsConfig.findOne({
      where: {
        campaignId: campaignId,
        id: { [db.Sequelize.Op.ne]: configId },
      },
      transaction,
    });

    if (existingConfig) {
      // If updating from one config to another, unassign the old one
      await existingConfig.update({ campaignId: null }, { transaction });
    }

    // Assign the SMS config to the campaign
    await config.update({ campaignId: campaignId }, { transaction });

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: "SMS configuration successfully assigned to campaign",
      data: {
        campaignId: campaignId,
        configId: configId,
        name: config.name,
      },
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

// remove SMS configuration from campaign
const removeSmsConfigFromCampaign = asyncHandler(async (req, res, next) => {
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
        createdBy: userId,
      },
      transaction,
    });

    if (!campaign) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "Campaign not found or you don't have permission to access it",
          404
        )
      );
    }

    // Find the SMS config assigned to this campaign
    const config = await SmsConfig.findOne({
      where: {
        campaignId: campaignId,
        userId: userId,
      },
      transaction,
    });

    if (!config) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "No configuration is assigned to this campaign",
          404
        )
      );
    }

    // Remove the campaign association from the SMS config
    await config.update({ campaignId: null }, { transaction });

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: "Configuration successfully removed from campaign",
      data: {
        campaignId: campaignId,
        configId: config.id,
      },
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = {
  createSmsConfig,
  updateSmsConfig,
  getAllSmsConfig,
  getConfigById,
  assignSmsConfigToCampaign,
  removeSmsConfigFromCampaign,
};