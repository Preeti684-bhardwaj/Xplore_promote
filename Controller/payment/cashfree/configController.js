const db = require("../../../dbConfig/dbConfig.js");
const CashfreeConfig = db.cashfreeConfig;
const Campaign = db.campaigns;
const ErrorHandler = require("../../../utils/ErrorHandler.js");
const asyncHandler = require("../../../utils/asyncHandler.js");

// create configuration
const createCashfreeConfig = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const {
      name,
      XClientId,
      XClientSecret,
      provider,
    } = req.body;
    const userId = req.user.id;

    // Validate required parameters
    if (
      !name ||
      !XClientId ||
      !XClientSecret ||
      !provider
    ) {
      await transaction.rollback();
      return next(new ErrorHandler("missing required field", 400));
    }
    // Check if configuration already exists
    const existingConfig = await CashfreeConfig.findOne(
      {
        where: {
          name,
          XClientId,
          XClientSecret,
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
    const newConfig = await CashfreeConfig.create(
      {
        name,
        XClientId,
        XClientSecret,
        provider,
        userId,
      },
      { transaction }
    );

    await transaction.commit();
    return res.status(201).json({
      success: true,
      message: `Cashfree configuration created successfully`,
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

// update config data for cashfree api
// const updateCashfreeConfig = asyncHandler(async (req, res, next) => {
//   const transaction = await db.sequelize.transaction();
//   try {
//     const { id } = req.params;
//     const {
//       redirection_url,
//     } = req.body;
//     const userId = req.user.id;

//     // Find existing configuration for the user
//     const existingConfig = await CashfreeConfig.findOne(
//       {
//         where: { id, userId },
//       },
//       { transaction }
//     );

//     if (!existingConfig) {
//       await transaction.rollback();
//       return next(new ErrorHandler("No configuration found", 404));
//     }

//     // Initialize update data with standard fields
//     const updateData = {
//       redirection_url:
//       redirection_url !== undefined
//           ? redirection_url
//           : existingConfig.redirection_url,
//     };

//     // Update the configuration
//     const updatedConfig = await existingConfig.update(updateData, {
//       transaction,
//     });

//     await transaction.commit();

//     return res.status(200).json({
//       success: true,
//       message: "Configuration updated successfully",
//       config: {
//         id: updatedConfig.id,
//         name: updatedConfig.name,
//         secret_key: updatedConfig.secret_key,
//         api_key: updatedConfig.api_key,
//         provider: updatedConfig.provider,
//         redirection_url: updatedConfig.redirection_url,
//         updatedAt: updatedConfig.updatedAt,
//       },
//     });
//   } catch (error) {
//     await transaction.rollback();
//     return next(new ErrorHandler(error.message, 500));
//   }
// });

// get all configuration of user
const getAllCashfreeConfig = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Find all whatsapp configurations for the user
    const userConfigurations = await CashfreeConfig.findAll({
      where: { userId },
      attributes: [
        "id",
        "name",
        "XClientId",
        "XClientSecret",
        "provider",
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

// get cashfree configuration for a specific campaign
const getCampaignCashfreeConfig = asyncHandler(async (req, res, next) => {
  try {
    const campaignId = req.query.campaignId;

    // Validate required parameter
    if (!campaignId) {
      return next(new ErrorHandler("Campaign ID is required", 400));
    }

    // Find the campaign
    const campaign = await Campaign.findOne({
      where: { campaignID: campaignId },
    });

    if (!campaign) {
      return next(new ErrorHandler("Campaign not found", 404));
    }

    // Get the cashfree configurations associated with this campaign
    const cashfreeConfigurations = await campaign.getPayment({
      attributes: [
        "id",
        "name",
        "XClientId",
        "XClientSecret",
        "provider",
        "createdAt",
        "updatedAt",
      ],
    });

    if (!cashfreeConfigurations || cashfreeConfigurations.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No Cashfree configuration found for this campaign",
        configurations: [],
      });
    }

    return res.status(200).json({
      success: true,
      count: cashfreeConfigurations.length,
      configurations: cashfreeConfigurations,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// assign cashfree configuration to campaign
const assignCashfreeConfigToCampaign = asyncHandler(async (req, res, next) => {
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
    
    // Check if the cashfree config exists and belongs to the user
    const config = await CashfreeConfig.findOne({
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

    // Add the cashfree config to the campaign
    await campaign.addPayment(config, { transaction });

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: "Cashfree configuration successfully assigned to campaign",
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
const removeCashfreeConfigFromCampaign = asyncHandler(async (req, res, next) => {
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

    // Find configurations associated with this campaign through the junction table
    const configs = await campaign.getPayment({
      where: {
        userId: userId
      },
      transaction
    });

    if (!configs || configs.length === 0) {
      await transaction.rollback();
      return next(
        new ErrorHandler("No configuration is assigned to this campaign", 404)
      );
    }

    // Remove the association between campaign and cashfree config
    await campaign.removePayment(configs, { transaction });

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: "Configuration successfully removed from campaign",
      data: {
        campaignId: campaignId,
        configIds: configs.map(config => config.id)
      },
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = {
  // updateCashfreeConfig,
  createCashfreeConfig,
  getAllCashfreeConfig,
  assignCashfreeConfigToCampaign,
  removeCashfreeConfigFromCampaign,
  getCampaignCashfreeConfig
};
