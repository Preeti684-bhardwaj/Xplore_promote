const axios = require("axios");
// const OpenAI = require("openai");
const db = require("../dbConfig/dbConfig.js");
const ModelConfig = db.modelConfigs;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

// Define the base prompt template
const BASE_PROMPT = `You are a professional sales expert representing the Hyundai IONIQ 5. Engage with customers in a friendly, informative, and helpful manner, just as a dealership salesperson would during a consultation. Your knowledge is based strictly on the information associated with the UUID: d950614d-2b47-4c4f-b71b-0c61b5082471.

When answering questions:
1. **Always provide information on Hyundai IONIQ 5 pricing, features, specifications, and additional costs.**
2. **NEVER say "No information available" for pricing, trim levels, or feature-related questions.**
3. Always provide *MINIMUM 2 OR 3 TRIPLETS* in your response.
4. Each triplet must strictly follow the format: "<Subject>, <Predicate>, <Object>".
5. Combine all triplets into a single string separated by commas. Ensure the "COT" field is JSON-compliant.
6. Greet customers with gratitude when they say "hi", "hello", or similar words.

Example:
{
    "COT": "ADAS, are standard on, Hyundai IONIQ 5, ADAS, enhance, safety through adaptive cruise control and lane keeping assist, ADAS, Aim to reduce, driver workload and mitigate accident consequences",
    "final_answer": "The Hyundai IONIQ 5 comes equipped with Advanced Driver Assistance Systems (ADAS) that significantly enhance safety features, including adaptive cruise control, lane keeping assist, and automatic emergency braking."
}

Additionally, after answering the customer's question:
1. Generate two projected follow-up questions the customer might ask next.
2. Format the response as JSON with four sections:
   {
       "summary": "<Summarize previous 2 questions & responses, excluding the latest>",
       "COT": "<Triplet1, Triplet2, Triplet3>",
       "final_answer": "<Your concise answer>",
       "projected_questions":[<Projected Question 1>, <Projected Question 2>]
   }

**DO NOT return "No information available" for pricing, colors, trim levels, or Hyundai IONIQ 5 features.**

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



const handleChatRequest = asyncHandler(async (req, res, next) => {
  try {
    // Input validation
    if (!req.body.Question) {
      throw new ErrorHandler("Missing required field: Question", 400);
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
      throw new ErrorHandler("Model configuration not found", 404);
    }

    // Construct the complete prompt
    const fullPrompt = `${BASE_PROMPT}${validQuestion}${PROMPT_SUFFIX}`;

    // Make API request
    const apiUrl = `https://serving.app.predibase.com/${config.tenant_id}/deployments/v2/llms/${config.deployment_name}/generate`;
    
    const response = await axios({
      method: 'post',
      url: apiUrl,
      data: {
        inputs: fullPrompt,
        parameters: {
          adapter_source: config.adapter_source,
          adapter_id: config.adapter_id,
          max_new_tokens: 500,
          temperature: 0.2,
          top_p: 0.1,
        }
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_token}`,
      }
    });

    // Process the response
    const generatedText = response.data.generated_text || '';
    
    try {
      // Parse and format the response
      const parsedResponse = JSON.parse(generatedText.trim());
      
      if (parsedResponse.COT) {
        parsedResponse.COT = formatTripletsAsString(parsedResponse.COT);
      }

      // Update usage statistics
      await config.update({
        lastUsed: new Date(),
        requestCount: config.requestCount + 1,
      });

      // Send the final response
      return res.status(200).json(parsedResponse);
      
    } catch (parseError) {
      console.error('Error parsing response:', parseError);
      throw new ErrorHandler('Error processing model response', 500);
    }

  } catch (error) {
    console.error("Error processing chat request:", error);
    
    // Enhanced error handling
    const statusCode = error.response?.status || 500;
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
      status: statusCode
    });

    // Send error response
    return res.status(statusCode).json({ error: errorMessage });
  }
});

// const handleChatRequest = asyncHandler(async (req, res, next) => {
//   // Set headers for streaming
//   res.setHeader('Content-Type', 'text/event-stream');
//   res.setHeader('Cache-Control', 'no-cache');
//   res.setHeader('Connection', 'keep-alive');

//   try {
//     // Input validation
//     if (!req.body.Question) {
//       throw new ErrorHandler("Missing required field: Question", 400);
//     }
//     const validQuestion = req.body.Question.toLowerCase();

//     // Get active model configuration
//     const config = await ModelConfig.findOne({
//       where: {
//         tenant_id: process.env.PREDIBASE_TENANT_ID,
//         deployment_name: process.env.PREDIBASE_DEPLOYMENT,
//         isActive: true,
//       },
//     });
//     if (!config) {
//       throw new ErrorHandler("Model configuration not found", 404);
//     }

//     // Construct the complete prompt
//     const fullPrompt = `${BASE_PROMPT}${validQuestion}${PROMPT_SUFFIX}`;

//     // Prepare streaming API request
//     const apiUrl = `https://serving.app.predibase.com/${config.tenant_id}/deployments/v2/llms/${config.deployment_name}/generate`;
    
//     const response = await axios({
//       method: 'post',
//       url: apiUrl,
//       data: {
//         inputs: fullPrompt,
//         parameters: {
//           adapter_source: config.adapter_source,
//           adapter_id: config.adapter_id,
//           max_new_tokens: 500,
//           temperature: 0.2,
//           top_p: 0.1,
//         }
//       },
//       headers: {
//         'Content-Type': 'application/json',
//         'Authorization': `Bearer ${config.api_token}`,
//       }
//     });

//     let accumulatedData = '';

//     response.data.on('data', chunk => {
//       try {
//         const lines = chunk.toString().split('\n');
//         lines.forEach(line => {
//           if (line.trim() === '') return;
          
//           // Remove "data: " prefix if present
//           const jsonStr = line.replace(/^data: /, '');
          
//           try {
//             const data = JSON.parse(jsonStr);
//             accumulatedData += data.generated_text || '';
            
//             // Send the chunk to the client
//             res.write(`data: ${JSON.stringify({ chunk: data.generated_text })}\n\n`);
//           } catch (parseError) {
//             console.error('Error parsing chunk:', parseError);
//           }
//         });
//       } catch (streamError) {
//         console.error('Error processing stream chunk:', streamError);
//       }
//     });

//     response.data.on('end', async () => {
//       try {
//         // Update usage statistics
//         await config.update({
//           lastUsed: new Date(),
//           requestCount: config.requestCount + 1,
//         });

//         // Try to parse the accumulated data as JSON
//         const cleanedData = accumulatedData.trim();
//         const parsedResponse = JSON.parse(cleanedData);
        
//         if (parsedResponse.COT) {
//           parsedResponse.COT = formatTripletsAsString(parsedResponse.COT);
//         }

//         // Send the final processed response
//         res.write(`data: ${JSON.stringify({ final: parsedResponse })}\n\n`);
//         res.end();
//       } catch (finalizeError) {
//         console.error('Error finalizing response:', finalizeError);
//         res.write(`data: ${JSON.stringify({ error: 'Error processing final response' })}\n\n`);
//         res.end();
//       }
//     });

//     response.data.on('error', (error) => {
//       console.error('Stream error:', error);
//       res.write(`data: ${JSON.stringify({ error: 'Stream error occurred' })}\n\n`);
//       res.end();
//     });

//   } catch (error) {
//     console.error("Error processing chat request:", error);
    
//     // Enhanced error handling
//     const statusCode = error.response?.status || 500;
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
//       status: statusCode
//     });

//     // Send error as SSE
//     res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
//     res.end();
//   }
// });

module.exports = { handleChatRequest };
