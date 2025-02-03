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

    const userAgent = req.headers['user-agent']?.toLowerCase() || '';
    const isSocialCrawler = (
      userAgent.includes('facebookexternalhit') ||
      userAgent.includes('twitterbot') ||
      userAgent.includes('linkedinbot') ||
      userAgent.includes('whatsapp')
    );

    // First, check if the shortCode exists in the User database
    const userShortCode = await User.findOne({
      where: { shortCode: req.params.shortCode }
    });

    if (userShortCode) {
      const profileLayout = JSON.parse(userShortCode.profileLayoutJSon);

      if (isSocialCrawler) {
        // Send HTML with meta tags for user profile
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
              <meta charset="UTF-8">
              <title>${userShortCode.name || 'User Profile'}</title>
              
              <!-- Open Graph / Facebook -->
              <meta property="og:type" content="profile">
              <meta property="og:url" content="${req.protocol}://${req.get('host')}/${req.params.shortCode}">
              <meta property="og:title" content="${userShortCode.name || 'User Profile'}">
              <meta property="og:description" content="${userShortCode.bio || 'View user profile'}">
              <meta property="og:image" content="${userShortCode.profileImage || ''}">
              
              <!-- Twitter -->
              <meta name="twitter:card" content="summary_large_image">
              <meta name="twitter:title" content="${userShortCode.name || 'User Profile'}">
              <meta name="twitter:description" content="${userShortCode.bio || 'View user profile'}">
              <meta name="twitter:image" content="${userShortCode.profileImage || ''}">
          </head>
          <body>
              <script>
                  window.location.href = "${req.protocol}://${req.get('host')}/${req.params.shortCode}";
              </script>
          </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(html);
      }

      // Normal JSON response for non-crawler requests
      return res.status(200).json({
        success: true,
        message: "User Profile Layout",
        type: "profile",
        profile: {
          id: userShortCode.id,
          layouts: [profileLayout],
        }
      });
    }

    // If not in User database, check Campaign database
    const campaignShortCode = await Campaign.findOne({
      where: { shortCode: req.params.shortCode }
    });

    if (campaignShortCode) {
      const campaignID = campaignShortCode.campaignID;

      const data = await Layout.findAndCountAll({
        where: { campaignID: campaignID },
        include: [
          { model: Campaign, as: "campaign", attributes: ["campaignID", "name", "description", "images"] },
        ],
        order: [["createdAt", "ASC"]],
      });

      const initialLayout = data.rows.find((layout) => layout.isInitial === true);

      if (isSocialCrawler) {
        // Send HTML with meta tags for campaign
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
              <meta charset="UTF-8">
              <title>${campaignShortCode.name || 'Campaign'}</title>
              
              <!-- Open Graph / Facebook -->
              <meta property="og:type" content="website">
              <meta property="og:url" content="${req.protocol}://${req.get('host')}/${req.params.shortCode}">
              <meta property="og:title" content="${campaignShortCode.name || 'Campaign'}">
              <meta property="og:description" content="${campaignShortCode.description || 'View campaign'}">
              <meta property="og:image" content="${campaignShortCode.images?.[0] || ''}">
              
              <!-- Twitter -->
              <meta name="twitter:card" content="summary_large_image">
              <meta name="twitter:title" content="${campaignShortCode.name || 'Campaign'}">
              <meta name="twitter:description" content="${campaignShortCode.description || 'View campaign'}">
              <meta name="twitter:image" content="${campaignShortCode.images?.[0] || ''}">
          </head>
          <body>
              <script>
                  window.location.href = "${req.protocol}://${req.get('host')}/${req.params.shortCode}";
              </script>
          </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(html);
      }

      // Normal JSON response for non-crawler requests
      return res.status(200).json({
        success: true,
        message: "Campaign Layouts",
        type: "campaign",
        campaign: {
          id: campaignID,
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

module.exports = { getLayoutByShortCode };


// const db = require("../dbConfig/dbConfig.js");
// const User = db.users;
// const Campaign = db.campaigns;
// const Layout = db.layouts;
// const ErrorHandler = require("../utils/ErrorHandler.js");
// const asyncHandler = require("../utils/asyncHandler.js");

// const getLayoutByShortCode = asyncHandler(async (req, res, next) => {
//     try {
//       // Check if shortCode is provided
//       if (!req.params?.shortCode) {
//         return next(new ErrorHandler("Missing Short Code", 400));
//       }
  
//       // First, check if the shortCode exists in the User database
//       const userShortCode = await User.findOne({
//         where: { shortCode: req.params.shortCode }
//       });
  
//       if (userShortCode) {
//         // If user found, parse and return user profile layout
//         const profileLayout = JSON.parse(userShortCode.profileLayoutJSon);
//         return res.status(200).json({
//           success: true,
//           message: "User Profile Layout",
//           type: "profile",
//           profile:{
//             id:userShortCode.id,
//             layouts:[profileLayout],
//           }
//         });
//       }
  
//       // If not in User database, check Campaign database
//       const campaignShortCode = await Campaign.findOne({
//         where: { shortCode: req.params.shortCode }
//       });
  
//       if (campaignShortCode) {
//         // If campaign found, retrieve layouts for this campaign
//         const campaignID = campaignShortCode.campaignID;
        
//         const data = await Layout.findAndCountAll({
//           where: { campaignID: campaignID },
//           include: [
//             { model: Campaign, as: "campaign", attributes: ["campaignID","name","description","images"] },
//           ],
//           order: [["createdAt", "ASC"]],
//         });
  
//         // Find the initial layout
//         const initialLayout = data.rows.find((layout) => layout.isInitial === true);
  
//         return res.status(200).json({
//           success: true,
//           message: "Campaign Layouts",
//           type: "campaign",
//           campaign:{
//             id:campaignID,
//             totalItems: data.count,
//             layouts: data.rows,
//             initialLayout: initialLayout || null,
//           }
//         });
//       }
  
//       // If shortCode not found in either User or Campaign database
//       return next(new ErrorHandler("Short Code not found", 404));
  
//     } catch (error) {
//       console.error("Error fetching layout by short code:", error);
//       return next(new ErrorHandler(error.message, 500));
//     }
//   });
  
//   module.exports = {getLayoutByShortCode}
