const axios = require("axios");
const OpenAI = require("openai");
const db = require("../dbConfig/dbConfig.js");
const ModelConfig = db.modelConfigs;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

// Define the base prompt template
const BASE_PROMPT = `You are a professional sales expert representing the Hyundai IONIQ 5. Engage with customers in a friendly, informative, and helpful manner, just as a dealership salesperson would during a consultation. Your knowledge is based strictly on the information associated with the UUID: d950614d-2b47-4c4f-b71b-0c61b5082471.

When answering questions:
1. Always provide *MINIMUM 2 OR 3 TRIPLETS* in your response.
2. Each triplet must strictly follow the format: "<Subject>, <Predicate>, <Object>".
3. Combine all triplets into a single string separated by commas. Ensure the "COT" field is JSON-compliant.
4. Greet customers with gratitude when they say "hi", "hello", or similar words.

Example:
{
    "COT": "ADAS, are standard on, Hyundai IONIQ 5, ADAS, enhance, safety through adaptive cruise control and lane keeping assist, ADAS, Aim to reduce, driver workload and mitigate accident consequences",
    "final_answer": "The Hyundai IONIQ 5 comes equipped with Advanced Driver Assistance Systems (ADAS) that significantly enhance safety features, including adaptive cruise control, lane keeping assist, and automatic emergency braking."
}

Additionally, after answering the customer's question:
1. Generate two projected follow-up questions the customer might ask next.
2. Format the response as JSON with three sections:
   {
       "COT": "<Triplet1, Triplet2, Triplet3>",
       "final_answer": "<Your concise answer>",
       "projected_questions": "<Projected Question 1>, <Projected Question 2>"
   }

If the data associated with the UUID does not cover the requested information, respond politely with:
{
    "COT": "No information available",
    "final_answer": "The requested information is not available in my context.",
}

You specialize exclusively in the Hyundai IONIQ 5. If asked about other models or brands, respond with:
{
    "COT": "IONIQ 5, is specialized by, this expert",
    "final_answer": "I specialize in the Hyundai IONIQ 5 and cannot provide information on other models.",
}

Maintain a conversational and professional tone. Customer's Question:`;

const PROMPT_SUFFIX = " Sales Expert's JSON Answer:";

// Format triplets as a JSON-compliant string
const formatTripletsAsString = (cotList) => {
  if (!Array.isArray(cotList)) return cotList;
  const validatedTriplets = cotList
    .filter((item) => Array.isArray(item) && item.length === 3)
    .map((item) => `("${item[0]}", "${item[1]}", "${item[2]}")`)
    .slice(0, 3);
  return validatedTriplets.join(", ");
};

// Modified Predibase response function to support streaming
const getPredibaseResponse = async (config, fullPrompt, res = null) => {
  const apiUrl = `https://serving.app.predibase.com/${config.tenant_id}/deployments/v2/llms/${config.deployment_name}/generate`;
  
  const requestBody = {
    inputs: fullPrompt,
    parameters: {
      adapter_source: config.adapter_source,
      adapter_id: config.adapter_id,
      max_new_tokens: config.max_new_tokens || 500,
      temperature: config.temperature || 0.2,
      top_p: config.top_p || 0.1,
      stream: res ? true : false, // Enable streaming if res is provided
    },
  };

  if (res) {
    // Streaming response
    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.api_token}`,
      },
      responseType: 'stream'
    });

    response.data.on('data', chunk => {
      const data = chunk.toString();
      try {
        const parsed = JSON.parse(data);
        if (parsed.generated_text) {
          res.write(`data: ${JSON.stringify({ content: parsed.generated_text })}\n\n`);
        }
      } catch (e) {
        console.error('Error parsing streaming chunk:', e);
      }
    });

    return new Promise((resolve, reject) => {
      response.data.on('end', () => resolve());
      response.data.on('error', reject);
    });
  } else {
    // Regular response
    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.api_token}`,
      },
    });

    let generatedText = response.data.generated_text || response.data;
    if (typeof generatedText === "string") {
      generatedText = generatedText.replace(/\n/g, "").trim();
      const parsedResponse = JSON.parse(generatedText);
      if (parsedResponse.COT) {
        parsedResponse.COT = formatTripletsAsString(parsedResponse.COT);
      }
      return parsedResponse;
    }
    return generatedText;
  }
};

// Main chat handler with SSE support
const handleChatRequest = asyncHandler(async (req, res, next) => {
  try {
    if (!req.body.Question) {
      return next(new ErrorHandler("Missing required field: Question", 400));
    }

    const validQuestion = req.body.Question.toLowerCase();
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

    const fullPrompt = `${BASE_PROMPT}${validQuestion}${PROMPT_SUFFIX}`;

    // If streaming is requested
    if (req.query.stream === "true") {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no"); // Important for nginx
      
      // Send initial connection established message
      res.write(`data: ${JSON.stringify({ status: "connected" })}\n\n`);

      try {
        await getPredibaseResponse(config, fullPrompt, res);
        res.write(`data: ${JSON.stringify({ status: "complete" })}\n\n`);
        res.end();
      } catch (streamError) {
        console.error("Streaming error:", streamError);
        res.write(`data: ${JSON.stringify({ error: "Streaming error occurred" })}\n\n`);
        res.end();
      }
    } else {
      // Regular non-streaming response
      const response = await getPredibaseResponse(config, fullPrompt);
      
      // Update usage statistics
      await config.update({
        lastUsed: new Date(),
        requestCount: config.requestCount + 1,
      });

      return res.status(200).json(response);
    }
  } catch (error) {
    console.error("Error processing chat request:", error);
    
    if (error.response?.status === 429) {
      return next(new ErrorHandler("Rate limit exceeded. Please try again later.", 429));
    }

    const errorMessage = error.response?.data
      ? typeof error.response.data === "string"
        ? error.response.data
        : JSON.stringify(error.response.data)
      : error.message || "Internal server error";

    console.error({
      message: errorMessage,
      stack: error.stack,
      responseData: error.response?.data,
      status: error.response?.status,
    });

    return next(new ErrorHandler(errorMessage, error.response?.status || 500));
  }
});

module.exports = { handleChatRequest };
