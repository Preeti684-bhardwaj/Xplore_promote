const db = require("../dbConfig/dbConfig.js");
const Analytic = db.analytics;
const Campaign = db.campaigns;
const sequelize = db.sequelize;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

// const createAnalytics = asyncHandler(async (req, res, next) => {
//   const t = await sequelize.transaction();

//   try {
//     const { source, device, ipAddress, deviceId, campaignID } = req.body;

//     // Validation
//     if (!campaignID) {
//       return next(new ErrorHandler("Campaign ID is required", 400));
//     }

//     if (!source || !device) {
//       return next(new ErrorHandler("missing required field", 400));
//     }

//     const validDevices = ['ios', 'android', 'windows', 'unknown'];
//     if (device && !validDevices.includes(device.toLowerCase())) {
//       return next(
//         new ErrorHandler(
//           `Invalid device type. Allowed values are: ${validDevices.join(', ')}`,
//           400
//         )
//       );
//     }

//     const validSources = [
//       "facebook",
//       "instagram",
//       "twitter",
//       "qr",
//       "direct",
//       "other",
//     ];
//     if (!validSources.includes(source.toLowerCase())) {
//       return next(
//         new ErrorHandler(
//           `Invalid source. Allowed values are: ${validSources.join(", ")}`,
//           400
//         )
//       );
//     }

//     // Check if campaign exists
//     const campaign = await Campaign.findByPk(campaignID);
//     if (!campaign) {
//       return next(new ErrorHandler("Campaign not found", 404));
//     }

//     // Create analytics entry
//     const analytics = await Analytic.create(
//       {
//         source,
//         device: device || "unknown",
//         ipAddress,
//         deviceId,
//         campaignID,
//       },
//       { transaction: t }
//     );

//     await t.commit();

//     return res.status(201).json({
//       success: true,
//       data: analytics,
//     });
//   } catch (error) {
//     await t.rollback();
//     return next(new ErrorHandler(error.message, 500));
//   }
// });

// // Get Campaign Analytics
// const getCampaignAnalytics = asyncHandler(async (req, res, next) => {
//   try {
//     const { campaignID } = req.params;

//     // Validate campaign ID
//     if (!campaignID) {
//       return next(new ErrorHandler("Campaign ID is required", 400));
//     }

//     // Check if campaign exists
//     const campaign = await Campaign.findByPk(campaignID);
//     if (!campaign) {
//       return next(new ErrorHandler("Campaign not found", 400));
//     }

//     // Get all analytics logs for the campaign
//     const analyticsLogs = await Analytic.findAll({
//       where: { campaignID },
//       order: [["createdAt", "DESC"]],
//     });

//     // Calculate total clicks
//     const totalClicks = analyticsLogs.length;

//     // Calculate source distribution
//     const sourceDistribution = await Analytic.findAll({
//       where: { campaignID },
//       attributes: [
//         "source",
//         [sequelize.fn("COUNT", sequelize.col("source")), "count"],
//         [sequelize.fn("ROUND",
//           sequelize.literal("COUNT(*)::decimal / (SELECT COUNT(*) FROM \"Analytics\" WHERE \"campaignID\" = :campaignID) * 100"),
//           2
//         ), "percentage"]
//       ],
//       group: ["source"],
//       order: [[sequelize.fn("COUNT", sequelize.col("source")), "DESC"]],
//       replacements: { campaignID }
//     });

//     // Calculate device distribution
//     const deviceDistribution = await Analytic.findAll({
//       where: { campaignID },
//       attributes: [
//         "device",
//         [sequelize.fn("COUNT", sequelize.col("device")), "count"],
//         [sequelize.fn("ROUND",
//           sequelize.literal("COUNT(*)::decimal / (SELECT COUNT(*) FROM \"Analytics\" WHERE \"campaignID\" = :campaignID) * 100"),
//           2
//         ), "percentage"]
//       ],
//       group: ["device"],
//       order: [[sequelize.fn("COUNT", sequelize.col("device")), "DESC"]],
//       replacements: { campaignID }
//     });

//     // Get latest analytics entries
//     // const recentActivities = await Analytic.findAll({
//     //   where: { campaignID },
//     //   attributes: ['source', 'device', 'createdAt'],
//     //   order: [['createdAt', 'DESC']],
//     //   limit: 5
//     // });

//     return res.status(200).json({
//       success: true,
//       data: {
//         totalClicks,
//         sourceDistribution: sourceDistribution.map(dist => ({
//           source: dist.source,
//           count: parseInt(dist.get('count')),
//           percentage: parseFloat(dist.get('percentage'))
//         })),
//         deviceDistribution: deviceDistribution.map(dist => ({
//           device: dist.device,
//           count: parseInt(dist.get('count')),
//           percentage: parseFloat(dist.get('percentage'))
//         })),
//         // recentActivities,
//         overview: {
//           topSource: sourceDistribution[0]?.source || 'N/A',
//           topDevice: deviceDistribution[0]?.device || 'N/A',
//           totalDevices: deviceDistribution.length
//         }
//       },
//     });

//   } catch (error) {
//     return next(new ErrorHandler(error.message, 400));
//   }
// });

const createAnalytics = asyncHandler(async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const {
      source,
      deviceId,
      campaignID,
      timeZone,
      deviceName,
      osVersion,
      buildNumber,
      screenWidth,
      screenHeight,
      appName,
      region,
      deviceModel,
      appVersion,
      language,
      browser,
      browserVersion,
    } = req.body;

    if (!campaignID) {
      return next(new ErrorHandler("Campaign ID is required", 400));
    }

    if (!source) {
      return next(new ErrorHandler("missing required field", 400));
    }
    const device = req.userOS.toLowerCase();
    const ipAddress = req.ipAddress;
    const validDevices = [
      "ios",
      "android",
      "windows",
      "linux",
      "macos",
      "other",
      "PostmanRuntime",
      "unknown",
    ];
    if (device && !validDevices.includes(device.toLowerCase())) {
      return next(
        new ErrorHandler(
          `Invalid device type. Allowed values are: ${validDevices.join(", ")}`,
          400
        )
      );
    }

    const validBrowsers = [
      "chrome",
      "firefox",
      "safari",
      "edge",
      "opera",
      "other",
    ];
    if (browser && !validBrowsers.includes(browser.toLowerCase())) {
      return next(
        new ErrorHandler(
          `Invalid browser type. Allowed values are: ${validBrowsers.join(
            ", "
          )}`,
          400
        )
      );
    }

    const validSources = [
      "facebook",
      "whatsapp",
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

    if (region && region.length !== 2) {
      return next(
        new ErrorHandler("Region must be a 2-character country code", 400)
      );
    }

    if (language && (language.length < 2 || language.length > 5)) {
      return next(
        new ErrorHandler("Language must be between 2-5 characters", 400)
      );
    }

    const campaign = await Campaign.findByPk(campaignID);
    if (!campaign) {
      return next(new ErrorHandler("Campaign not found", 404));
    }

    const analytics = await Analytic.create(
      {
        source,
        device: device || "unknown",
        ipAddress,
        deviceId,
        campaignID,
        timeZone,
        deviceName,
        osVersion,
        buildNumber,
        osName:device,
        screenWidth,
        screenHeight,
        appName,
        region,
        deviceModel,
        appVersion,
        language,
        browser,
        browserVersion,
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

const getCampaignAnalytics = asyncHandler(async (req, res, next) => {
  try {
    const { campaignID } = req.params;

    if (!campaignID) {
      return next(new ErrorHandler("Campaign ID is required", 400));
    }

    const campaign = await Campaign.findByPk(campaignID);
    if (!campaign) {
      return next(new ErrorHandler("Campaign not found", 400));
    }

    // Get all analytics logs for the campaign
    const analyticsLogs = await Analytic.findAll({
      where: { campaignID },
      order: [["createdAt", "DESC"]],
    });

    const totalClicks = analyticsLogs.length;

    // Existing distributions
    const sourceDistribution = await Analytic.findAll({
      where: { campaignID },
      attributes: [
        "source",
        [sequelize.fn("COUNT", sequelize.col("source")), "count"],
        [
          sequelize.fn(
            "ROUND",
            sequelize.literal(
              'COUNT(*)::decimal / (SELECT COUNT(*) FROM "Analytics" WHERE "campaignID" = :campaignID) * 100'
            ),
            2
          ),
          "percentage",
        ],
      ],
      group: ["source"],
      order: [[sequelize.fn("COUNT", sequelize.col("source")), "DESC"]],
      replacements: { campaignID },
    });

    const deviceDistribution = await Analytic.findAll({
      where: { campaignID },
      attributes: [
        "device",
        [sequelize.fn("COUNT", sequelize.col("device")), "count"],
        [
          sequelize.fn(
            "ROUND",
            sequelize.literal(
              'COUNT(*)::decimal / (SELECT COUNT(*) FROM "Analytics" WHERE "campaignID" = :campaignID) * 100'
            ),
            2
          ),
          "percentage",
        ],
      ],
      group: ["device"],
      order: [[sequelize.fn("COUNT", sequelize.col("device")), "DESC"]],
      replacements: { campaignID },
    });

    // New distributions
    const osDistribution = await Analytic.findAll({
      where: { campaignID },
      attributes: [
        "osName",
        [sequelize.fn("COUNT", sequelize.col("osName")), "count"],
        [
          sequelize.fn(
            "ROUND",
            sequelize.literal(
              'COUNT(*)::decimal / (SELECT COUNT(*) FROM "Analytics" WHERE "campaignID" = :campaignID) * 100'
            ),
            2
          ),
          "percentage",
        ],
      ],
      group: ["osName"],
      order: [[sequelize.fn("COUNT", sequelize.col("osName")), "DESC"]],
      replacements: { campaignID },
    });

    const regionDistribution = await Analytic.findAll({
      where: { campaignID },
      attributes: [
        "region",
        [sequelize.fn("COUNT", sequelize.col("region")), "count"],
        [
          sequelize.fn(
            "ROUND",
            sequelize.literal(
              'COUNT(*)::decimal / (SELECT COUNT(*) FROM "Analytics" WHERE "campaignID" = :campaignID) * 100'
            ),
            2
          ),
          "percentage",
        ],
      ],
      group: ["region"],
      order: [[sequelize.fn("COUNT", sequelize.col("region")), "DESC"]],
      replacements: { campaignID },
    });

    return res.status(200).json({
      success: true,
      data: {
        totalClicks,
        sourceDistribution: sourceDistribution.map((dist) => ({
          source: dist.source,
          count: parseInt(dist.get("count")),
          percentage: parseFloat(dist.get("percentage")),
        })),
        deviceDistribution: deviceDistribution.map((dist) => ({
          device: dist.device,
          count: parseInt(dist.get("count")),
          percentage: parseFloat(dist.get("percentage")),
        })),
        osDistribution: osDistribution.map((dist) => ({
          osName: dist.osName,
          count: parseInt(dist.get("count")),
          percentage: parseFloat(dist.get("percentage")),
        })),
        regionDistribution: regionDistribution.map((dist) => ({
          region: dist.region,
          count: parseInt(dist.get("count")),
          percentage: parseFloat(dist.get("percentage")),
        })),
        overview: {
          topSource: sourceDistribution[0]?.source || "N/A",
          topDevice: deviceDistribution[0]?.device || "N/A",
          topOS: osDistribution[0]?.osName || "N/A",
          topRegion: regionDistribution[0]?.region || "N/A",
          totalDevices: deviceDistribution.length,
        },
      },
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 400));
  }
});

module.exports = { createAnalytics, getCampaignAnalytics };
