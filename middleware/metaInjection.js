const cheerio = require('cheerio');
const {getCampaignMetaData}=require('../validators/campaignValidations')

const metaTagMiddleware = () => {
  return async (req, res, next) => {
    // Store the original send function
    const originalSend = res.send;

    // Override the send function
    res.send = function (body) {
      try {
        // Only process HTML responses and when meta data is available
        if (res.locals.meta && typeof body === 'string' && body.includes('<!DOCTYPE html>')) {
          const $ = cheerio.load(body);
          
          // Remove existing meta tags to avoid duplicates
          $('meta[property^="og:"]').remove();
          $('meta[name^="twitter:"]').remove();
          $('meta[name="description"]').remove();
          $('meta[name="keywords"]').remove();
          
          // Add basic meta tags
          $('head').append(`<meta name="description" content="${res.locals.meta.description}">`);
          $('head').append(`<meta name="keywords" content="Campaign Management, Campaign editor tool, Marketing Automation, Digital Campaigns, Social Media Ads, Social Media Ads campaign Tools, Techie chefs campaigns, Techie chefs campaigns 2025, Techie Chefs Digital Menu, Best tech-friendly recipes for food enthusiasts, Explore innovative dishes with Techie Chefs digital menu">`);
          
          // Add Open Graph meta tags
          $('head').append(`<meta property="og:title" content="${res.locals.meta.title}">`);
          $('head').append(`<meta property="og:description" content="${res.locals.meta.description}">`);
          $('head').append(`<meta property="og:url" content="${res.locals.meta.url}">`);
          $('head').append(`<meta property="og:image" content="${res.locals.meta.image}">`);
          
          // Add Twitter Card meta tags
          $('head').append(`<meta name="twitter:card" content="summary_large_image">`);
          $('head').append(`<meta name="twitter:title" content="${res.locals.meta.title}">`);
          $('head').append(`<meta name="twitter:description" content="${res.locals.meta.description}">`);
          $('head').append(`<meta name="twitter:image" content="${res.locals.meta.image}">`);
          
          // Update favicon
          $('link[rel="icon"]').remove();
          $('head').append(`<link rel="icon" href="${res.locals.meta.image}">`);
          
          // Update title
          $('title').text(res.locals.meta.title);
          
          // Send the modified HTML
          return originalSend.call(this, $.html());
        }
        
        // If no meta data or not HTML, send original response
        return originalSend.call(this, body);
      } catch (error) {
        console.error('Error in meta tag middleware:', error);
        return originalSend.call(this, body);
      }
    };

    // Check if the request is from a social media crawler
    const userAgent = req.headers['user-agent'] || '';
    const isSocialMediaBot = /facebookexternalhit|twitterbot|whatsapp|linkedin|telegram|discord/i.test(userAgent);

    // Only process routes that match campaign patterns
    const campaignIdMatch = req.path.match(/\/v1\/viewLayout\/([^\/]+)/);
    
    if (campaignIdMatch && (isSocialMediaBot || req.query.forceMetaTags)) {
      const campaignShortCode = campaignIdMatch[1];
      
      try {
        const metaData = await getCampaignMetaData(campaignShortCode);
        
        if (metaData) {
          res.locals.meta = {
            title: metaData.title,
            description: metaData.description,
            url: `${process.env.PRODUCTION_BASE_URL}/campaigns/${campaignShortCode}`,
            image: metaData.image
          };
        }
      } catch (error) {
        console.error('Meta tag middleware error:', error);
      }
    }
    
    next();
  };
};

module.exports = metaTagMiddleware;