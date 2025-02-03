const db = require("../dbConfig/dbConfig.js");
const User = db.users;
const Campaign = db.campaigns;
const Layout = db.layouts;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

const getLayoutByShortCode = asyncHandler(async (req, res, next) => {
    try {
      // Check if shortCode is provided
      if (!req.params?.shortCode) {
        return next(new ErrorHandler("Missing Short Code", 400));
      }
  
      // First, check if the shortCode exists in the User database
      const userShortCode = await User.findOne({
        where: { shortCode: req.params.shortCode }
      });
  
      if (userShortCode) {
        // If user found, parse and return user profile layout
        const profileLayout = JSON.parse(userShortCode.profileLayoutJSon);
        return res.status(200).json({
          success: true,
          message: "User Profile Layout",
          type: "profile",
          profile:{
            id:userShortCode.id,
            layouts:[profileLayout],
          }
        });
      }
  
      // If not in User database, check Campaign database
      const campaignShortCode = await Campaign.findOne({
        where: { shortCode: req.params.shortCode }
      });
  
      if (campaignShortCode) {
        // If campaign found, retrieve layouts for this campaign
        const campaignID = campaignShortCode.campaignID;
        
        const data = await Layout.findAndCountAll({
          where: { campaignID: campaignID },
          include: [
            { model: Campaign, as: "campaign", attributes: ["campaignID","name","description","images"] },
          ],
          order: [["createdAt", "ASC"]],
        });
  
        // Find the initial layout
        const initialLayout = data.rows.find((layout) => layout.isInitial === true);
  
        return res.status(200).json({
          success: true,
          message: "Campaign Layouts",
          type: "campaign",
          campaign:{
            id:campaignID,
            totalItems: data.count,
            layouts: data.rows,
            initialLayout: initialLayout || null,
          }
        });
      }
  
      // If shortCode not found in either User or Campaign database
      return next(new ErrorHandler("Short Code not found", 404));
  
    } catch (error) {
      console.error("Error fetching layout by short code:", error);
      return next(new ErrorHandler(error.message, 500));
    }
  });
  const getPreviewByShortCode = asyncHandler(async (req, res, next) => {
    try {
        const { shortCode } = req.params;
        
        // Reuse your existing logic to fetch data
        const user = await User.findOne({ where: { shortCode } });
        if (user) {
            return res.send(`
                <!DOCTYPE html>
                <html>
                    <head>
                        <title>${user.name}</title>
                        <meta property="og:title" content="${user.name}" />
                        <meta property="og:description" content="${user.bio}" />
                        <meta property="og:image" content="${user.avatar}" />
                    </head>
                    <body>Redirecting...</body>
                </html>
            `);
        }

        const campaign = await Campaign.findOne({ where: { shortCode } });
        if (campaign) {
            return res.send(`
                <!DOCTYPE html>
                <html>
                    <head>
                        <title>${campaign.name}</title>
                        <meta property="og:title" content="${campaign.name}" />
                        <meta property="og:description" content="${campaign.description}" />
                        <meta property="og:image" content="${campaign.thumbnail}" />
                    </head>
                    <body>Redirecting...</body>
                </html>
            `);
        }

        return next(new ErrorHandler("Resource not found", 404));
    } catch (error) {
        next(error);
    }
});
  
  module.exports = {getLayoutByShortCode,getPreviewByShortCode}
