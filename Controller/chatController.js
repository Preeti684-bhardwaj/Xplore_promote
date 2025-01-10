const axios = require("axios");
const db = require("../dbConfig/dbConfig.js");
const ModelConfig = db.modelConfigs;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

// Define the base prompt template
const BASE_PROMPT = `You are a professional sales expert representing the Hyundai IONIQ 5. Engage with customers in a friendly, informative, and helpful manner, just as a dealership salesperson would during a consultation. Your knowledge is based strictly on the information associated with the UUID: d950614d-2b47-4c4f-b71b-0c61b5082471.

When answering questions, think step-by-step in a short Knowledge Graph (KG) triplet format. Limit the response to a maximum of 2-3 concise triplets. Each triplet must follow the structure:

<Subject, Predicate, Object>
After listing the triplets, provide a final concise and confident answer in JSON format:
{
    "triplets": [
        "<List of triplets>",
        ...
    ],
    "final_answer": "<Your concise answer>"
}

If the data associated with the UUID does not cover the requested information, respond politely with:
{
    "triplets": [
        "<No triplets available>"
    ],
    "final_answer": "The requested information is not available in my context."
}

You specialize exclusively in the Hyundai IONIQ 5. If asked about other models or brands, respond with:
{
    "triplets": [
        "<IONIQ 5, is specialized by, this expert>"
    ],
    "final_answer": "I specialize in the Hyundai IONIQ 5 and cannot provide information on other models."
}

Maintain a conversational and professional tone. Customer's Question:`;

const PROMPT_SUFFIX = " Answer:";

const handleChatRequest = asyncHandler(async (req, res, next) => {
  try {
    // Input validation
    if (!req.body.Question) {
      return next(new ErrorHandler("Missing required field: Question", 400));
    }

    // Get active model configuration
    const config = await ModelConfig.findOne({
      where: {
        tenant_id: process.env.PREDIBASE_TENANT_ID,
        deployment_name: process.env.PREDIBASE_DEPLOYMENT,
        isActive: true,
      },
    });

    if (!config) {
      return next(new ErrorHandler("Model configuration not found", 404));
    }

    // Construct the complete prompt
    const fullPrompt = `${BASE_PROMPT}${req.body?.Question}${PROMPT_SUFFIX}`;

    // console.log(fullPrompt);

    // Prepare API request
    const apiUrl = `https://serving.app.predibase.com/${config.tenant_id}/deployments/v2/llms/${config.deployment_name}/generate`;

    const requestBody = {
      inputs: fullPrompt,
      parameters: {
        adapter_source: config.adapter_source,
        adapter_id: config.adapter_id,
        max_new_tokens: 500,
        temperature: 0.2, 
        top_p: 0.1, 
      },
    };

    // Make request to Predibase API
    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.api_token}`,
      },
    });

    // Update usage statistics
    await config.update({
      lastUsed: new Date(),
      requestCount: config.requestCount + 1,
    });

    // Extract and format the response to match Python implementation
    const responseData = {
      generated_text: response.data,
    };

    res.json(responseData.generated_text);
  } catch (error) {
    console.error("Error processing chat request:", error);

    // Enhanced error handling
    const errorMessage = error.response?.data
      ? typeof error.response.data === "string"
        ? error.response.data
        : JSON.stringify(error.response.data)
      : error.message || "Internal server error";

    return next(new ErrorHandler(errorMessage, error.response?.status || 500));
  }
});

module.exports = { handleChatRequest };