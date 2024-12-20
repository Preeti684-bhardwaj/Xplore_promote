const db = require("../dbConfig/dbConfig.js");
const Analytic = db.analytics;
const Campaign = db.campaigns;
const sequelize = db.sequelize;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

const createAnalytics = asyncHandler(async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { source, device, ipAddress, deviceId, campaignID } = req.body;

    // Validation
    if (!campaignID) {
      return next(new ErrorHandler("Campaign ID is required", 400));
    }

    if (!source || !device || !ipAddress) {
      return next(new ErrorHandler("missing required field", 400));
    }

    const validDevices = ['IOS', 'Android', 'Windows', 'Unknown'];
    if (device && !validDevices.includes(device.toUpperCase())) {
      return next(
        new ErrorHandler(
          `Invalid device type. Allowed values are: ${validDevices.join(', ')}`,
          400
        )
      );
    }

    const validSources = [
      "facebook",
      "instagram",
      "twitter",
      "qr",
      "direct",
      "other",
    ];
    if (!validSources.includes(source.toLowerCase())) {
      return next(
        new ErrorHandler(
          `Invalid source. Allowed values are: ${validSources.join(", ")}`,
          400
        )
      );
    }

    // Check if campaign exists
    const campaign = await Campaign.findByPk(campaignID);
    if (!campaign) {
      return next(new ErrorHandler("Campaign not found", 404));
    }

    // Create analytics entry
    const analytics = await Analytic.create(
      {
        source,
        device: device || "Unknown",
        ipAddress,
        deviceId,
        campaignID,
      },
      { transaction: t }
    );

    await t.commit();

    return res.status(201).json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    await t.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get Campaign Analytics
const getCampaignAnalytics = asyncHandler(async (req, res, next) => {
  try {
    const { campaignID } = req.params;

    // Validate campaign ID
    if (!campaignID) {
      return next(new ErrorHandler("Campaign ID is required", 400));
    }

    // Check if campaign exists
    const campaign = await Campaign.findByPk(campaignID);
    if (!campaign) {
      return next(new ErrorHandler("Campaign not found", 400));
    }

    // Get all analytics logs for the campaign
    const analyticsLogs = await Analytic.findAll({
      where: { campaignID },
      order: [["createdAt", "DESC"]],
    });

    // Calculate total clicks
    const totalClicks = analyticsLogs.length;

    // Calculate source distribution
    const sourceDistribution = await Analytic.findAll({
      where: { campaignID },
      attributes: [
        "source",
        [sequelize.fn("COUNT", sequelize.col("source")), "count"],
        [sequelize.fn("ROUND", 
          sequelize.literal("COUNT(*)::decimal / (SELECT COUNT(*) FROM \"Analytics\" WHERE \"campaignID\" = :campaignID) * 100"), 
          2
        ), "percentage"]
      ],
      group: ["source"],
      order: [[sequelize.fn("COUNT", sequelize.col("source")), "DESC"]],
      replacements: { campaignID }
    });

    // Calculate device distribution
    const deviceDistribution = await Analytic.findAll({
      where: { campaignID },
      attributes: [
        "device",
        [sequelize.fn("COUNT", sequelize.col("device")), "count"],
        [sequelize.fn("ROUND", 
          sequelize.literal("COUNT(*)::decimal / (SELECT COUNT(*) FROM \"Analytics\" WHERE \"campaignID\" = :campaignID) * 100"), 
          2
        ), "percentage"]
      ],
      group: ["device"],
      order: [[sequelize.fn("COUNT", sequelize.col("device")), "DESC"]],
      replacements: { campaignID }
    });

    // Get latest analytics entries
    // const recentActivities = await Analytic.findAll({
    //   where: { campaignID },
    //   attributes: ['source', 'device', 'createdAt'],
    //   order: [['createdAt', 'DESC']],
    //   limit: 5
    // });

    return res.status(200).json({
      success: true,
      data: {
        totalClicks,
        sourceDistribution: sourceDistribution.map(dist => ({
          source: dist.source,
          count: parseInt(dist.get('count')),
          percentage: parseFloat(dist.get('percentage'))
        })),
        deviceDistribution: deviceDistribution.map(dist => ({
          device: dist.device,
          count: parseInt(dist.get('count')),
          percentage: parseFloat(dist.get('percentage'))
        })),
        // recentActivities,
        overview: {
          topSource: sourceDistribution[0]?.source || 'N/A',
          topDevice: deviceDistribution[0]?.device || 'N/A',
          totalDevices: deviceDistribution.length
        }
      },
    });

  } catch (error) {
    return next(new ErrorHandler(error.message, 400));
  }
});


module.exports = { createAnalytics, getCampaignAnalytics };
