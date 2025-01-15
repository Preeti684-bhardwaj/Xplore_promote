const axios = require("axios");
const db = require("../dbConfig/dbConfig.js");
const ModelConfig = db.modelConfigs;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

// Define the base prompt template
const BASE_PROMPT = `You are a professional sales expert representing the Hyundai IONIQ 5. Engage with customers in a friendly, informative, and helpful manner, just as a dealership salesperson would during a consultation. Your knowledge is based strictly on the information associated with the UUID: d950614d-2b47-4c4f-b71b-0c61b5082471.

When answering questions:
1. Always provide a structured response in the form of triplets.
2. Each triplet must strictly follow the format: {"<Subject>", "<Predicate>", "<Object>"}.
3. Combine all triplets into a single string separated by commas. Ensure the "COT" field is JSON-compliant.

Example:
{
    "COT": " ADAS, are standard on, Hyundai IONIQ 5, ADAS, enhance, safety through adaptive cruise control and lane keeping assist, ADAS, Aim to reduce, driver workload and mitigate accident consequences",
    "final_answer": "The Hyundai IONIQ 5 comes equipped with Advanced Driver Assistance Systems (ADAS) that significantly enhance safety features, including adaptive cruise control, lane keeping assist, and automatic emergency braking."
}

If the data associated with the UUID does not cover the requested information, respond politely with:
{
    "COT": "<No information available>",
    "final_answer": "The requested information is not available in my context."
}

You specialize exclusively in the Hyundai IONIQ 5. If asked about other models or brands, respond with:
{
    "COT": "<IONIQ 5, is specialized by, this expert>",
    "final_answer": "I specialize in the Hyundai IONIQ 5 and cannot provide information on other models."
}

Maintain a conversational and professional tone. Customer's Question:`;

const PROMPT_SUFFIX = " Sales Expert's JSON Answer:";

// Format triplets as a JSON-compliant string
const formatTripletsAsString = (cotList) => {
  if (!Array.isArray(cotList)) return cotList;
  
  const validatedTriplets = cotList
      .filter(item => Array.isArray(item) && item.length === 3)
      .map(item => `("${item[0]}", "${item[1]}", "${item[2]}")`)
      .slice(0, 3);
      
  return validatedTriplets.join(', ');
};

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
      const fullPrompt = `${BASE_PROMPT}${req.body.Question}${PROMPT_SUFFIX}`;

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

      // Process and clean the response
      let generatedText = response.data.generated_text || response.data;
      
      try {
          // If the response is a string, try to parse it as JSON
          if (typeof generatedText === 'string') {
              generatedText = generatedText.replace(/\n/g, '').trim();
              const parsedResponse = JSON.parse(generatedText);
              
              // Format COT field if it exists
              if (parsedResponse.COT) {
                  parsedResponse.COT = formatTripletsAsString(parsedResponse.COT);
              }
              
              return res.status(200).json(parsedResponse);
          }
          
          // If response is already an object, just send it
          return res.status(200).json(generatedText);
          
      } catch (parseError) {
          console.error("Error parsing generated text:", parseError);
          return res.status(422).json({
              error: 'Malformed response from AI service',
              details: generatedText
          });
      }

  } catch (error) {
      console.error("Error processing chat request:", error);

      // Enhanced error handling with rate limit detection
      if (error.response?.status === 429) {
          return next(new ErrorHandler("Rate limit exceeded. Please try again later.", 429));
      }

      const errorMessage = error.response?.data
          ? typeof error.response.data === "string"
              ? error.response.data
              : JSON.stringify(error.response.data)
          : error.message || "Internal server error";

      // Log detailed error information
      console.error({
          message: errorMessage,
          stack: error.stack,
          responseData: error.response?.data,
          status: error.response?.status
      });

      return next(new ErrorHandler(errorMessage, error.response?.status || 500));
  }
});

module.exports = { handleChatRequest };
