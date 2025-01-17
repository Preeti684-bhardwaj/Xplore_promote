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
    top_p
  } = req.body;

  if (!tenant_id || !deployment_name || !api_token || !adapter_id) {
    return next(new ErrorHandler('Missing required fields', 400));
  }

  try {
    const existingConfig = await ModelConfig.findOne({
      where: { tenant_id, adapter_id }
    });

    const configData = {
      api_token,
      adapter_source,
      adapter_id,
      max_new_tokens,
      isActive: true,
      temperature,
      top_p
    };

    if (existingConfig) {
      await existingConfig.update(configData);
      return res.status(200).json({
        success:true,
        message: 'Configuration updated',
        config: existingConfig
      });
    }

    const newConfig = await ModelConfig.create({
      tenant_id,
      deployment_name,
      ...configData
    });

    res.status(201).json({
      success:true,
      message: 'Configuration created',
      config: newConfig
    });
  } catch (error) {
    console.error('Error managing configuration:', error);
    return next(new ErrorHandler('Internal server error', 500));
  }
});

module.exports={createOrUpdateConfig}



