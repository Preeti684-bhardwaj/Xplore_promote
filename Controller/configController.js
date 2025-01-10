// controllers/configController.js
const db = require('../dbConfig/dbConfig.js');
const ModelConfig = db.modelConfigs;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

const createOrUpdateConfig = asyncHandler(async (req, res, next) => {
  const {
    tenant_id,
    deployment_name,
    api_token,
    adapter_source,
    adapter_id,
    max_new_tokens,
    temperature,
    top_p,
  } = req.body;

  // Validate required fields
  if (!tenant_id || !deployment_name || !api_token || !adapter_id) {
    return next(
      new ErrorHandler('Missing required fields: tenant_id, deployment_name, and api_token are required',400));
  }

  try {
    // Check if configuration exists
    const existingConfig = await ModelConfig.findOne({
      where: { tenant_id, adapter_id },
    });

    if (existingConfig) {
      // Update existing configuration
      await existingConfig.update({
        api_token,
        adapter_source,
        adapter_id,
        max_new_tokens,
        isActive: true,
        temperature,
        top_p,
      });

      return res.status(200).json({
        message: 'Configuration updated',
        config: existingConfig,
      });
    }

    // Create new configuration
    const newConfig = await ModelConfig.create({
      tenant_id,
      deployment_name,
      api_token,
      adapter_source,
      adapter_id,
      max_new_tokens,
      isActive: true,
      temperature,
      top_p,
    });

    res.status(201).json({
      message: 'Configuration created',
      config: newConfig,
    });
  } catch (error) {
    console.error('Error managing configuration:', error);
    return next(new ErrorHandler('Internal server error', 500));
  }
});


module.exports={createOrUpdateConfig}