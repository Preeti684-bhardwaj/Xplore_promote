const db = require("../dbConfig/dbConfig.js");
const ChatBotConfig = db.chatBotConfig;
const cron = require("node-cron");
const { GoogleAICacheManager } = require("@google/generative-ai/server");

const refreshGeminiCache = async (api_key, cacheName) => {
  try {
    const cacheManager = new GoogleAICacheManager(api_key);
    const updatedCache = await cacheManager.update(cacheName, {
      ttlSeconds: 3600,
    });

    console.log(`Cache refreshed: ${updatedCache.name}`);
    return updatedCache;
  } catch (error) {
    console.error("Error refreshing cache:", error);
    throw error;
  }
};

// Set up cache refresh scheduler
function setupCacheRefreshScheduler() {
  // Run every 55 minutes to refresh cache before TTL expires
  cron.schedule("*/55 * * * *", async () => {
    try {
      console.log("Running scheduled cache refresh...");

      // Get all Gemini configurations
      const geminiConfigs = await ChatBotConfig.findAll({
        where: {
          model_provider: "gemini",
        },
      });

      // Refresh each cache
      for (const config of geminiConfigs) {
        try {
          if (config.otherDetails?.cache_name) {
            console.log(
              `Refreshing cache for campaign ${config.campaignId}: ${config.otherDetails.cache_name}`
            );
            await refreshGeminiCache(
              config.api_key,
              config.otherDetails.cache_name
            );
          }
        } catch (error) {
          console.error(
            `Failed to refresh cache for campaign ${config.campaignId}:`,
            error
          );
        }
      }

      console.log("Cache refresh completed");
    } catch (error) {
      console.error("Error in cache refresh scheduler:", error);
    }
  });

  console.log("Cache refresh scheduler initialized");
}

module.exports = { setupCacheRefreshScheduler };
