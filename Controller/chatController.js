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

// Function to get response from Predibase
const getPredibaseResponse = async (config, fullPrompt) => {
  const apiUrl = `https://serving.app.predibase.com/${config.tenant_id}/deployments/v2/llms/${config.deployment_name}/generate`;

  const requestBody = {
    inputs: fullPrompt,
    parameters: {
      adapter_source: config.adapter_source,
      adapter_id: config.adapter_id,
      max_new_tokens: config.max_new_tokens || 500,
      temperature: config.temperature || 0.2,
      top_p: config.top_p || 0.1,
    },
  };

  const response = await axios.post(apiUrl, requestBody, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.api_token}`,
    },
  });

  let generatedText = response.data.generated_text || response.data;

  // Process the response
  if (typeof generatedText === "string") {
    generatedText = generatedText.replace(/\n/g, "").trim();
    const parsedResponse = JSON.parse(generatedText);

    if (parsedResponse.COT) {
      parsedResponse.COT = formatTripletsAsString(parsedResponse.COT);
    }

    return parsedResponse;
  }

  return generatedText;
};

// Function to process streaming via OpenAI
const processOpenAIStream = async (content) => {
  const openai = new OpenAI();
  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: JSON.stringify(content) }],
    stream: true,
  });

  return stream;
};

// Main chat handler
const handleChatRequest = asyncHandler(async (req, res, next) => {
  try {
    // Input validation
    if (!req.body.Question) {
      return next(new ErrorHandler("Missing required field: Question", 400));
    }
    const validQuestion = req.body.Question.toLowerCase();

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
    const fullPrompt = `${BASE_PROMPT}${validQuestion}${PROMPT_SUFFIX}`;

    try {
      // Get initial response from Predibase
      const predibaseResponse = await getPredibaseResponse(config, fullPrompt);

      // If streaming is requested
      if (req.query.stream === "true") {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const stream = await processOpenAIStream(predibaseResponse);

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }
        // console.log("i am in streaming");

        // Send the final complete response
        return res.status(200).json({
          streaming: true,
          finalResponse: predibaseResponse,
        });
      } else {
        // Regular response without streaming
        // Update usage statistics
        await config.update({
          lastUsed: new Date(),
          requestCount: config.requestCount + 1,
        });
        return res.status(200).json(predibaseResponse);
      }
    } catch (parseError) {
      console.error("Error processing response:", parseError);
      return res.status(422).json({
        error: "Malformed response from AI service",
        details: parseError.message,
      });
    }
  } catch (error) {
    console.error("Error processing chat request:", error);

    // Enhanced error handling with rate limit detection
    if (error.response?.status === 429) {
      return next(
        new ErrorHandler("Rate limit exceeded. Please try again later.", 429)
      );
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
      status: error.response?.status,
    });

    return next(new ErrorHandler(errorMessage, error.response?.status || 500));
  }
});

// const handleChatRequest = asyncHandler(async (req, res, next) => {
//   try {
//     // Input validation
//     if (!req.body.Question) {
//       return next(new ErrorHandler("Missing required field: Question", 400));
//     }
//     const validQuestion=req.body.Question.toLowerCase();
//     console.log(validQuestion);

//     // Get active model configuration
//     const config = await ModelConfig.findOne({
//       where: {
//         tenant_id: process.env.PREDIBASE_TENANT_ID,
//         deployment_name: process.env.PREDIBASE_DEPLOYMENT,
//         isActive: true,
//       },
//     });

//     if (!config) {
//       return next(new ErrorHandler("Model configuration not found", 404));
//     }

//     // Construct the complete prompt
//     const fullPrompt = `${BASE_PROMPT}${validQuestion}${PROMPT_SUFFIX}`;

//     // Prepare API request
//     const apiUrl = `https://serving.app.predibase.com/${config.tenant_id}/deployments/v2/llms/${config.deployment_name}/generate`;
//     const requestBody = {
//       inputs: fullPrompt,
//       parameters: {
//         adapter_source: config.adapter_source,
//         adapter_id: config.adapter_id,
//         max_new_tokens: 500,
//         temperature: 0.2,
//         top_p: 0.1,
//       },
//     };

//     // Make request to Predibase API
//     const response = await axios.post(apiUrl, requestBody, {
//       headers: {
//         "Content-Type": "application/json",
//         Authorization: `Bearer ${config.api_token}`,
//       },
//     });

//     // Update usage statistics
//     await config.update({
//       lastUsed: new Date(),
//       requestCount: config.requestCount + 1,
//     });

//     // Process and clean the response
//     let generatedText = response.data.generated_text || response.data;

//     try {
//       // If the response is a string, try to parse it as JSON
//       if (typeof generatedText === "string") {
//         generatedText = generatedText.replace(/\n/g, "").trim();
//         const parsedResponse = JSON.parse(generatedText);

//         // Format COT field if it exists
//         if (parsedResponse.COT) {
//           parsedResponse.COT = formatTripletsAsString(parsedResponse.COT);
//         }

//         return res.status(200).json(parsedResponse);
//       }

//       // If response is already an object, just send it
//       return res.status(200).json(generatedText);
//     } catch (parseError) {
//       console.error("Error parsing generated text:", parseError);
//       return res.status(422).json({
//         error: "Malformed response from AI service",
//         details: generatedText,
//       });
//     }
//   } catch (error) {
//     console.error("Error processing chat request:", error);

//     // Enhanced error handling with rate limit detection
//     if (error.response?.status === 429) {
//       return next(
//         new ErrorHandler("Rate limit exceeded. Please try again later.", 429)
//       );
//     }

//     const errorMessage = error.response?.data
//       ? typeof error.response.data === "string"
//         ? error.response.data
//         : JSON.stringify(error.response.data)
//       : error.message || "Internal server error";

//     // Log detailed error information
//     console.error({
//       message: errorMessage,
//       stack: error.stack,
//       responseData: error.response?.data,
//       status: error.response?.status,
//     });

//     return next(new ErrorHandler(errorMessage, error.response?.status || 500));
//   }
// });

module.exports = { handleChatRequest };
