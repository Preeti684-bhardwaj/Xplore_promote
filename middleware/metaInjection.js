const {getCampaignMetaData}=require('../validators/campaignValidations')

const metaTagMiddleware = () => {
    return async (req, res, next) => {
      // Only process routes that match campaign patterns
      const campaignIdMatch = req.path.match(/\/v1\/campaign\/getOne\/([^\/]+)/);
      console.log(campaignIdMatch,"hi i am in metatag middleare");
      
      if (campaignIdMatch) {
        const campaignId = campaignIdMatch[1];
        
        try {
          const metaData = await getCampaignMetaData(campaignId);
          console.log(metaData,"i am here getting metadata value");
          
          if (metaData) {
            res.locals.meta = {
              title: metaData.title,
              description: metaData.description,
              'og:title': metaData.title,
              'og:description': metaData.description,
              'og:url': metaData.url,
              'og:image': metaData.image,
              'twitter:card': 'summary_large_image',
              'twitter:title': metaData.title,
              'twitter:description': metaData.description,
              'twitter:image': metaData.image
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