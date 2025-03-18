const db = require("../../dbConfig/dbConfig.js");
const PaymentConfig = db.paymentConfig;
const Campaign = db.campaigns;
const ErrorHandler = require("../../utils/ErrorHandler.js");
const asyncHandler = require("../../../utils/asyncHandler.js");

// create configuration
const createConfig = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const {
      name,
      secret_key,
      api_key,
      webhook_url,
      redirection_url,
      provider,
    } = req.body;
    const userId = req.user.id;

    // Validate required parameters
    if (
      !name ||
      !secret_key ||
      !api_key ||
      !webhook_url ||
      !provider
    ) {
      await transaction.rollback();
      return next(new ErrorHandler("missing required field", 400));
    }
    // Check if configuration already exists
    const existingConfig = await PaymentConfig.findOne(
      {
        where: {
          name,
          secret_key,
          api_key,
          provider,
          userId,
        },
      },
      { transaction }
    );

    if (existingConfig) {
      await transaction.rollback();
      return next(new ErrorHandler(`Configuration already exists`, 409));
    }

    // Create the new configuration
    const newConfig = await PaymentConfig.create(
      {
        name,
        secret_key,
        api_key,
        webhook_url,
        redirection_url,
        provider,
        userId,
      },
      { transaction }
    );

    await transaction.commit();
    return res.status(201).json({
      success: true,
      message: `Payment configuration created successfully`,
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

// update config data for payment api
const updateConfig = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { id } = req.params;
    const {
      webhook_url,
      redirection_url,
    } = req.body;
    const userId = req.user.id;

    // Find existing configuration for the user
    const existingConfig = await PaymentConfig.findOne(
      {
        where: { id, userId },
      },
      { transaction }
    );

    if (!existingConfig) {
      await transaction.rollback();
      return next(new ErrorHandler("No configuration found", 404));
    }

    // Initialize update data with standard fields
    const updateData = {
      webhook_url: webhook_url !== undefined ? webhook_url : existingConfig.webhook_url,
      redirection_url:
      redirection_url !== undefined
          ? redirection_url
          : existingConfig.redirection_url,
    };

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
        secret_key: updatedConfig.secret_key,
        api_key: updatedConfig.api_key,
        webhook_url: updatedConfig.webhook_url,
        provider: updatedConfig.provider,
        redirection_url: updatedConfig.redirection_url,
        updatedAt: updatedConfig.updatedAt,
      },
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

// get all configuration of user
const getAllConfig = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Find all whatsapp configurations for the user
    const userConfigurations = await PaymentConfig.findAll({
      where: { userId },
      attributes: [
        "id",
        "name",
        "secret_key",
        "api_key",
        "webhook_url",
        "redirection_url",
        "createdAt",
        "updatedAt",
      ],
      order: [["createdAt", "DESC"]], // Optional: Orders by most recently created first
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

// assign payment configuration to campaign
const assignConfigToCampaign = asyncHandler(async (req, res, next) => {
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
    
    // Check if the payment config exists and belongs to the user
    const config = await PaymentConfig.findOne({
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

    // Add the payment config to the campaign
    await campaign.addPayment(config, { transaction });

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: "Payment configuration successfully assigned to campaign",
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

// remove whatsapp configuration to campaign
const removeConfigFromCampaign = asyncHandler(async (req, res, next) => {
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

    // Find the whatsapp assigned to this campaign
    const config = await WhatsappConfig.findOne({
      where: {
        campaignId: campaignId,
        userId: userId,
      },
      transaction,
    });

    if (!config) {
      await transaction.rollback();
      return next(
        new ErrorHandler("No configuration is assigned to this campaign", 404)
      );
    }

    // Remove the campaign association from the whatsapp
    await config.update({ campaignId: null }, { transaction });

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: "configuration successfully removed from campaign",
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
  updateConfig,
  createConfig,
  getAllConfig,
  assignConfigToCampaign,
  removeConfigFromCampaign,
};
