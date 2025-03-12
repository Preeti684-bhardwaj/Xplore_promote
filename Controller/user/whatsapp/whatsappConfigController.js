const db = require("../../../dbConfig/dbConfig.js");
const WhatsappConfig = db.whatsappConfig;
const Campaign = db.campaigns;
const ErrorHandler = require("../../../utils/ErrorHandler.js");
const asyncHandler = require("../../../utils/asyncHandler.js");

// create configuration
const createConfig = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const {
      name,
      version,
      phone_number_id,
      otp_template_name,
      link_template_name,
      meta_app_access_token,
      webhook_verify_token,
    } = req.body;
    const userId = req.user.id;

    // Validate required parameters
    if (
      !name ||
      !version ||
      !phone_number_id ||
      !otp_template_name ||
      !link_template_name ||
      !meta_app_access_token 
    ) {
      await transaction.rollback();
      return next(new ErrorHandler("missing required field", 400));
    }
    // Check if configuration already exists
    const existingConfig = await WhatsappConfig.findOne(
      {
        where: {
          name,
          phone_number_id,
          meta_app_access_token,
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
    const newConfig = await WhatsappConfig.create(
      {
        name,
        version,
        phone_number_id,
        link_template_name,
        otp_template_name,
        meta_app_access_token,
        webhook_verify_token,
        userId,
      },
      { transaction }
    );

    await transaction.commit();
    return res.status(201).json({
      success: true,
      message: `WhatsApp configuration created successfully`,
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
 
// update config data for proxy whatsapp api
const updateConfig = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { id } = req.params;
    const {
      name,
      version,
      link_template_name,
      otp_template_name,
      webhook_verify_token,
    } = req.body;
    const userId = req.user.id;

    // Find existing configuration for the user
    const existingConfig = await WhatsappConfig.findOne(
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

    // Initialize update data with standard fields
    const updateData = {
      name: name !== undefined ? name : existingConfig.name,
      version: version !== undefined ? version : existingConfig.version,
      link_template_name:link_template_name !== undefined ? link_template_name : existingConfig.link_template_name,
      otp_template_name:otp_template_name!== undefined ? otp_template_name : existingConfig.otp_template_name,
      webhook_verify_token: webhook_verify_token !== undefined ? webhook_verify_token : existingConfig.webhook_verify_token
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
        version: updatedConfig.version,
        link_template_name:updatedConfig.link_template_name,
        otp_template_name:updatedConfig.otp_template_name,
        phone_number_id: updatedConfig.phone_number_id,
        meta_app_access_token: updatedConfig.meta_app_access_token,
        webhook_verify_token: updatedConfig.webhook_verify_token,
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
const getAllConfig = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Find all whatsapp configurations for the user
    const userConfigurations = await WhatsappConfig.findAll({
      where: { userId },
      attributes: [
        "id",
        "name",
        "version",
        "phone_number_id",
        "otp_template_name",
        "link_template_name",
        "meta_app_access_token",
        "webhook_verify_token",
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

// assign whatsapp configuration to campaign
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
    // Check if the whatsapp config exists and belongs to the user
    const config = await WhatsappConfig.findOne({
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

    // Check if another campaign is already using this whatsapp config
    const existingAssignment = await WhatsappConfig.findOne({
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
          "This whatsapp configuration is already assigned to another campaign",
          409
        )
      );
    }

    // Check if campaign already has a different whatsapp configuration
    const existingConfig = await WhatsappConfig.findOne({
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

    // Assign the whatsapp to the campaign
    await config.update({ campaignId: campaignId }, { transaction });

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: "Whatsapp configuration successfully assigned to campaign",
      data: {
        campaignId: campaignId,
        configId:configId,
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
        new ErrorHandler(
          "No configuration is assigned to this campaign",
          404
        )
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
