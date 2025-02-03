const axios = require("axios");
const db = require("../dbConfig/dbConfig.js");
const ModelConfig = db.modelConfigs;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

// Define the base prompt template
const BASE_PROMPT = `You are a *Hyundai IONIQ 5 sales expert*, trained to engage with customers in a persuasive, friendly, and professional manner. Your knowledge is based strictly on the information associated with the UUID: d950614d-2b47-4c4f-b71b-0c61b5082471.

## *🔹 Sales Strategy*
- *Understand the customer's requirements* before making recommendations.
- *Offer the best Hyundai IONIQ 5 trim* based on their budget, performance, and feature needs.
- *Upsell & suggest alternatives* when necessary.
- *Convince the customer to take action* (schedule a test drive, apply for financing, or make a purchase).
- *Never say "No information available"* about features, pricing, or trim levels.

## *🔹 Expected Response Format (JSON)*
{
    "final_answer": "<Concise and informative answer>",
    "projected_questions": ["Follow-up question 1", "Follow-up question 2"]
}

Customer's Question:`;

const PROMPT_SUFFIX = " Sales Expert's JSON Answer:";
const SUMMARY = " Previous Conversation Summary:";

const greetingWords = new Set([
  "hi", "hello", "hey", "good morning", "good afternoon", 
  "namaste", "good evening", "greetings"
]);

// Store conversation history
let finalAnswerHistory = [];

// Helper functions
const isGreeting = (question) => greetingWords.has(question.toLowerCase().trim());

const generateSummary = () => {
  if (finalAnswerHistory.length < 2) return " ";
  const lastFew = finalAnswerHistory.slice(-2);
  return [
    `Previously we discussed: ${lastFew[0]}`,
    `Additionally we saw: ${lastFew[1]}`
  ].join(" ");
};

const updateSummary = (response) => {
  const finalAnswer = response?.final_answer?.trim();
  if (finalAnswer && !isGreeting(finalAnswer)) {
    finalAnswerHistory.push(finalAnswer);
    if (finalAnswerHistory.length > 9) finalAnswerHistory.shift();
  }
};

const sanitizeJsonResponse = (responseText) => {
  try {
    const cleanText = responseText
      .trim()
      .replace(/\\n/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[\x00-\x1F\x7F]/g, '');

    const jsonStart = cleanText.indexOf('{');
    const jsonEnd = cleanText.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No valid JSON');

    const jsonString = cleanText.slice(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonString);

    // Validate required fields
    if (!parsed.final_answer || !Array.isArray(parsed.projected_questions)) {
      throw new Error('Invalid response format');
    }

    return {
      final_answer: parsed.final_answer,
      projected_questions: parsed.projected_questions.slice(0, 2)
    };
  } catch (error) {
    return {
      final_answer: 'I apologize, but I encountered an error processing the response. Could you please rephrase your question?',
      projected_questions: [
        'Could you please rephrase your question?',
        'Would you like to ask about a specific aspect of the IONIQ 5?'
      ]
    };
  }
};

const formatXMLResponse = (jsonData, summary, question) => {
  try {
    let xml = '<response>\n';
    xml += `  <customer_question>${question}</customer_question>\n`;
    
    if (summary.trim()) {
      xml += `  <summary>${summary}</summary>\n`;
    }
    
    xml += `  <final_answer>${jsonData.final_answer}</final_answer>\n`;
    xml += '  <projected_questions>\n';
    jsonData.projected_questions.forEach(q => {
      xml += `    <question>${q}</question>\n`;
    });
    xml += '  </projected_questions>\n</response>';
    
    return xml;
  } catch (error) {
    return '<response>\n  <error>Error formatting XML response</error>\n</response>';
  }
};

const handleChatRequest = asyncHandler(async (req, res, next) => {
  try {
    if (!req.body.Question) {
      throw new ErrorHandler("Missing required field: Question", 400);
    }

    const question = req.body.Question.trim();
    
    // Handle greetings immediately
    if (isGreeting(question)) {
      return res.status(200).send(formatXMLResponse(
        {
          final_answer: "Hello! Welcome to Hyundai. How can I assist you with the IONIQ 5 today?",
          projected_questions: [
            "What are the available trim levels for the IONIQ 5?",
            "What is the starting price of the IONIQ 5?"
          ]
        },
        "",
        question
      ));
    }

    // Get model configuration
    const config = await ModelConfig.findOne({
      where: {
        tenant_id: process.env.PREDIBASE_TENANT_ID,
        deployment_name: process.env.PREDIBASE_DEPLOYMENT,
        isActive: true
      }
    });

    if (!config) throw new ErrorHandler("Model configuration not found", 404);

    // Construct prompt
    const previousSummary = generateSummary();
    const fullPrompt = `${BASE_PROMPT}${question}${SUMMARY}${previousSummary}${PROMPT_SUFFIX}`;

    // API configuration
    const apiUrl = `https://serving.app.predibase.com/${config.tenant_id}/deployments/v2/llms/${config.deployment_name}/generate_stream`;
    
    // Set headers for streaming XML
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let responseBuffer = "";
    let finalResponse = null;

    const response = await axios({
      method: "post",
      url: apiUrl,
      data: {
        inputs: fullPrompt,
        parameters: {
          adapter_source: config.adapter_source,
          adapter_id: config.adapter_id,
          max_new_tokens: 500,
          temperature: 0.2,
          top_p: 0.1
        }
      },
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.api_token}`
      },
      responseType: "stream"
    });

    response.data.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      
      lines.forEach(line => {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (parsed.token?.text) {
              responseBuffer += parsed.token.text;
              // Stream partial XML while receiving data
              res.write(`<partial>${parsed.token.text}</partial>`);
            }
          } catch (e) {
            // Skip invalid JSON chunks
          }
        }
      });
    });

    response.data.on("end", async () => {
      try {
        // Process complete response
        const sanitized = sanitizeJsonResponse(responseBuffer);
        updateSummary(sanitized);
        
        // Update model usage stats
        await config.update({
          lastUsed: new Date(),
          requestCount: config.requestCount + 1
        });

        // Generate final XML
        const summary = generateSummary();
        const xmlResponse = formatXMLResponse(sanitized, summary, question);
        
        // Send final XML and end connection
        res.write(xmlResponse);
        res.end();

      } catch (error) {
        console.error("Final processing error:", error);
        res.write('<response><error>Error processing final response</error></response>');
        res.end();
      }
    });

  } catch (error) {
    console.error("Chat error:", error);
    const status = error.statusCode || 500;
    const message = error.message || "Internal server error";
    res.status(status).send(`<response><error>${message}</error></response>`);
  }
});

module.exports = { handleChatRequest };





// const axios = require("axios");
// // const OpenAI = require("openai");
// const db = require("../dbConfig/dbConfig.js");
// const ModelConfig = db.modelConfigs;
// const ErrorHandler = require("../utils/ErrorHandler.js");
// const asyncHandler = require("../utils/asyncHandler.js");

// // Define the base prompt template
// const BASE_PROMPT = `You are a professional sales expert representing the Hyundai IONIQ 5. Engage with customers in a friendly, informative, and helpful manner, just as a dealership salesperson would during a consultation. Your knowledge is based strictly on the information associated with the UUID: d950614d-2b47-4c4f-b71b-0c61b5082471.

// When answering questions:
// 1. *Always provide information on Hyundai IONIQ 5 pricing, features, specifications, and additional costs.*
// 2. *NEVER say "No information available" for pricing, trim levels, or feature-related questions.*
// 3. Always provide MINIMUM 2 OR 3 TRIPLETS in your response.
// 4. Each triplet must strictly follow the format: "<Subject>, <Predicate>, <Object>".
// 5. Combine all triplets into a single string separated by commas. Ensure the "COT" field is JSON-compliant.
// 6. Greet customers with gratitude when they say "hi", "hello", or similar words, but DO NOT include greetings in the conversation summary.

// Example:
// {
//     "COT": "ADAS, are standard on, Hyundai IONIQ 5, ADAS, enhance, safety through adaptive cruise control and lane keeping assist, ADAS, Aim to reduce, driver workload and mitigate accident consequences",
//     "final_answer": "The Hyundai IONIQ 5 comes equipped with Advanced Driver Assistance Systems (ADAS) that significantly enhance safety features, including adaptive cruise control, lane keeping assist, and automatic emergency braking."
// }

// Additionally, after answering the customer's question:
// 1. Generate two projected follow-up questions the customer might ask next.
// 2. Format the response as JSON with four sections:
//    {
//     "summary": "<Summarize previous 2 questions & responses, excluding the latest>",
//     "COT": "<Triplet1, Triplet2, Triplet3>",
//     "final_answer": "<Your concise answer>",
//     "projected_questions":[<Projected Question 1>, <Projected Question 2>]
//    }

// *DO NOT return "No information available" for pricing, colors, trim levels, or Hyundai IONIQ 5 features.*

// Maintain a conversational and professional tone. Customer's Question:`;

// const PROMPT_SUFFIX = " Sales Expert's JSON Answer:";
// const SUMMARY = " Previous Conversation Summary:";

// // Format triplets as a JSON-compliant string
// const formatTripletsAsString = (cotList) => {
//   if (!Array.isArray(cotList)) return cotList;
//   const validatedTriplets = cotList
//     .filter((item) => Array.isArray(item) && item.length === 3)
//     .map((item) => `("${item[0]}", "${item[1]}", "${item[2]}")`)
//     .slice(0, 3);
//   return validatedTriplets.join(", ");
// };
// const greetingWords = new Set([
//   "hi",
//   "hello",
//   "hey",
//   "good morning",
//   "good afternoon",
//   "namaste",
//   "good evening",
//   "greetings",
// ]);
// // Helper functions
// const isGreeting = (question) => greetingWords.has(question);
// // Store conversation history
// let finalAnswerHistory = [];
// // Function to generate summary from conversation history
// const generateSummary = () => {
//   if (finalAnswerHistory.length < 2) {
//     return " "; // No summary for the first question
//   }

//   // Select last 2 responses (excluding the most recent one)
//   const lastFew = finalAnswerHistory.slice(-3, -1); // Get last 2 responses, excluding latest

//   const summaryStatements = [];

//   if (lastFew.length >= 1) {
//     summaryStatements.push(`Previously we discussed, ${lastFew[0]}`);
//   }
//   if (lastFew.length >= 2) {
//     summaryStatements.push(`Additionally we saw about, ${lastFew[1]}`);
//   }

//   return summaryStatements.join(" ");
// };

// // Function to update conversation history
// const updateSummary = (response) => {
//   const finalAnswer = response?.final_answer?.trim();
//   if (finalAnswer && !isGreeting(finalAnswer)) {
//     finalAnswerHistory.push(finalAnswer);
//     // Keep only last 9 responses
//     if (finalAnswerHistory.length > 9) {
//       finalAnswerHistory.shift();
//     }
//   }
// };

// const sanitizeJsonResponse = (responseText) => {
//   try {
//     // Remove any leading/trailing whitespace
//     let cleanText = responseText.trim();

//     // Step 1: Basic cleanup
//     cleanText = cleanText
//       .replace(/\\n/g, ' ')           // Replace escaped newlines with space
//       .replace(/\s+/g, ' ')           // Replace multiple spaces with single space
//       .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
//       .trim();

//     // Step 2: Find valid JSON boundaries
//     const jsonStart = cleanText.indexOf('{');
//     const jsonEnd = cleanText.lastIndexOf('}');
    
//     if (jsonStart === -1 || jsonEnd === -1) {
//       throw new Error('No valid JSON object found in response');
//     }

//     // Extract the JSON portion
//     cleanText = cleanText.slice(jsonStart, jsonEnd + 1);

//     // Step 3: Fix common JSON issues
//     cleanText = cleanText
//       // Fix double quotes
//       .replace(/"{2,}/g, '"')
//       // Fix escaped quotes that shouldn't be escaped
//       .replace(/\\"+/g, '"')
//       // Remove backslashes before characters that don't need escaping
//       .replace(/\\(?!["\\/bfnrtu])/g, '')
//       // Ensure property names are properly quoted
//       .replace(/(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\:/g, '$1"$2":')
//       // Fix trailing commas in objects and arrays
//       .replace(/,(\s*[\]}])/g, '$1');

//     // Step 4: Validate and parse JSON
//     const parsedJson = JSON.parse(cleanText);

//     // Step 5: Validate required fields
//     const requiredFields = ['summary', 'COT', 'final_answer', 'projected_questions'];
//     const missingFields = requiredFields.filter(field => !(field in parsedJson));

//     if (missingFields.length > 0) {
//       throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
//     }

//     // Step 6: Ensure projected_questions is an array
//     if (!Array.isArray(parsedJson.projected_questions)) {
//       parsedJson.projected_questions = [];
//     }

//     return parsedJson;
//   } catch (error) {
//     console.error('Error sanitizing JSON response:', error);
    
//     // Return a fallback response instead of throwing
//     return {
//       summary: '',
//       COT: '',
//       final_answer: 'I apologize, but I encountered an error processing the response. Could you please rephrase your question?',
//       projected_questions: [
//         'Could you please rephrase your question?',
//         'Would you like to ask about a specific aspect of the IONIQ 5?'
//       ]
//     };
//   }
// };

// const handleChatRequest = asyncHandler(async (req, res, next) => {
//   try {
//     // Input validation
//     if (!req.body.Question) {
//       throw new ErrorHandler("Missing required field: Question", 400);
//     }
//     const validQuestion = req.body.Question.toLowerCase().trim();

//     // Handle greetings with immediate response
//     if (isGreeting(validQuestion)) {
//       return res.status(200).json({
//         summary: "",
//         COT: "",
//         final_answer:
//           "Hello! Welcome to Hyundai. How can I assist you with the IONIQ 5 today?",
//         projected_questions: [
//           "What are the available trim levels for the IONIQ 5?",
//           "What is the starting price of the IONIQ 5?",
//         ],
//       });
//     }

//     // Set headers for streaming
//     res.setHeader("Content-Type", "text/event-stream");
//     res.setHeader("Cache-Control", "no-cache");
//     res.setHeader("Connection", "keep-alive");

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

//     // Get previous conversation summary
//     const previousSummary = generateSummary();

//     // Construct the complete prompt
//     const fullPrompt = `${BASE_PROMPT}${validQuestion} Previous Conversation Summary:${previousSummary}${PROMPT_SUFFIX}`;

//     // Make API request
//     const apiUrl = `https://serving.app.predibase.com/${config.tenant_id}/deployments/v2/llms/${config.deployment_name}/generate_stream`;

//     let responseText = "";
//     let jsonBuffer = "";
//     let isJsonComplete = false;

//     const response = await axios({
//       method: "post",
//       url: apiUrl,
//       data: {
//         inputs: fullPrompt,
//         parameters: {
//           adapter_source: config.adapter_source,
//           adapter_id: config.adapter_id,
//           max_new_tokens: 500,
//           temperature: 0.2,
//           top_p: 0.1,
//         },
//       },
//       headers: {
//         "Content-Type": "application/json",
//         Authorization: `Bearer ${config.api_token}`,
//       },
//       responseType: "stream",
//     });

//     response.data.on("data", (chunk) => {
//       const lines = chunk.toString().split("\n");

//       for (const line of lines) {
//         if (line.startsWith("data: ")) {
//           const data = line.slice(6); // Remove 'data: ' prefix

//           try {
//             const parsed = JSON.parse(data);
//             if (parsed.token && parsed.token.text) {
//               responseText += parsed.token.text;

//               // Check if we have a complete JSON object
//               if (responseText.includes("}")) {
//                 try {
//                   const cleanJson = sanitizeJsonResponse(responseText);
//                   isJsonComplete = true;
//                   jsonBuffer = JSON.stringify(cleanJson);

//                   // Send cleaned chunk to client
//                   res.write(
//                     `data: ${JSON.stringify({
//                       // text: parsed.token.text,
//                       isComplete: isJsonComplete,
//                       cleanJson: isJsonComplete ? cleanJson : null,
//                     })}\n\n`
//                   );
//                 } catch (e) {
//                   // Not a complete JSON yet or invalid JSON
//                   res.write(
//                     `data: ${JSON.stringify({
//                       text: parsed.token.text,
//                       isComplete: false,
//                     })}\n\n`
//                   );
//                 }
//               } else {
//                 // Send partial chunk
//                 res.write(
//                   `data: ${JSON.stringify({
//                     text: parsed.token.text,
//                     isComplete: false,
//                   })}\n\n`
//                 );
//               }
//             }
//           } catch (e) {
//             // Skip invalid JSON
//             continue;
//           }
//         }
//       }
//     });

//     response.data.on("end", async () => {
//       try {
//         // Parse and clean final complete JSON
//         const finalResponse = sanitizeJsonResponse(jsonBuffer);

//         // Update conversation history
//         updateSummary(finalResponse);

//         // Update usage statistics
//         await config.update({
//           lastUsed: new Date(),
//           requestCount: config.requestCount + 1,
//         });

//         // Send end of stream with clean JSON
//         // res.write(
//         //   `data: ${JSON.stringify({
//         //     text: "[DONE]",
//         //     isComplete: true,
//         //     finalResponse,
//         //   })}\n\n`
//         // );
//         res.end();
//       } catch (error) {
//         console.error("Error processing final response:", error);
//         res.write(
//           `data: ${JSON.stringify({ error: "Error processing response" })}\n\n`
//         );
//         res.end();
//       }
//     });
//   } catch (error) {
//     console.error("Error processing chat request:", error);
//     const statusCode = error.response?.status || 500;
//     const errorMessage = error.response?.data
//       ? typeof error.response.data === "string"
//         ? error.response.data
//         : JSON.stringify(error.response.data)
//       : error.message || "Internal server error";

//     // For streaming errors, send error in SSE format
//     res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
//     res.end();
//   }
// });

// // const handleChatRequest = asyncHandler(async (req, res, next) => {
// //   res.setHeader('Content-Type', 'text/event-stream');
// //   res.setHeader('Cache-Control', 'no-cache');
// //   res.setHeader('Connection', 'keep-alive');

// //   try {
// //     if (!req.body.Question) {
// //       throw new ErrorHandler("Missing required field: Question", 400);
// //     }
    
// //     const validQuestion = req.body.Question.toLowerCase().trim();
    
// //     if (isGreeting(validQuestion)) {
// //       const greetingResponse = {
// //         summary: "",
// //         COT: "",
// //         final_answer: "Hello! Welcome to Hyundai. How can I assist you with the IONIQ 5 today?",
// //         projected_questions: [
// //           "What are the available trim levels for the IONIQ 5?",
// //           "What is the starting price of the IONIQ 5?",
// //         ]
// //       };
      
// //       res.write(`data: ${JSON.stringify(greetingResponse)}\n\n`);
// //       res.end();
// //       return;
// //     }

// //     const config = await ModelConfig.findOne({
// //       where: {
// //         tenant_id: process.env.PREDIBASE_TENANT_ID,
// //         deployment_name: process.env.PREDIBASE_DEPLOYMENT,
// //         isActive: true,
// //       },
// //     });

// //     if (!config) {
// //       throw new ErrorHandler("Model configuration not found", 404);
// //     }

// //     const previousSummary = generateSummary();
// //     const fullPrompt = `${BASE_PROMPT}${validQuestion} Previous Conversation Summary:${previousSummary}${PROMPT_SUFFIX}`;

// //     let chunks = [];
// //     let currentResponse = '';

// //     const response = await axios({
// //       method: "post",
// //       url: `https://serving.app.predibase.com/${config.tenant_id}/deployments/v2/llms/${config.deployment_name}/generate_stream`,
// //       data: {
// //         inputs: fullPrompt,
// //         parameters: {
// //           adapter_source: config.adapter_source,
// //           adapter_id: config.adapter_id,
// //           max_new_tokens: 500,
// //           temperature: 0.2,
// //           top_p: 0.1,
// //         }
// //       },
// //       headers: {
// //         "Content-Type": "application/json",
// //         Authorization: `Bearer ${config.api_token}`,
// //       },
// //       responseType: 'stream'
// //     });
// //     res.status(200).send(response)

// //     response.data.on('data', (chunk) => {
// //       const chunkStr = chunk.toString();
// //       chunks.push(chunkStr);
      
// //       // Split the chunk into lines and process each line
// //       const lines = chunkStr.split('\n');
      
// //       for (const line of lines) {
// //         if (line.trim().startsWith('data: ')) {
// //           try {
// //             // Extract the JSON part
// //             const jsonStr = line.trim().slice(5).trim();
// //             const chunkData = JSON.parse(jsonStr);

// //             // Check if we have generated text
// //             if (chunkData.generated_text) {
// //               console.log('Generated text found:', chunkData.generated_text);
              
// //               try {
// //                 // Clean up the response text
// //                 const cleanResponse = chunkData.generated_text
// //                   .replace(/^[^{]*{/, '{') // Remove anything before the first {
// //                   .replace(/}[^}]*$/, '}') // Remove anything after the last }
// //                   .trim();
                
// //                 console.log('Cleaned response:', cleanResponse);
                
// //                 // Try to parse the cleaned response
// //                 const parsedResponse = JSON.parse(cleanResponse);
                
// //                 // Format triplets if present
// //                 if (parsedResponse.COT) {
// //                   parsedResponse.COT = formatTripletsAsString(parsedResponse.COT);
// //                 }
                
// //                 // Send the parsed response to the client
// //                 res.write(`data: ${JSON.stringify(parsedResponse)}\n\n`);
                
// //                 // Update conversation history
// //                 updateSummary(parsedResponse);
                
// //                 // Save the current response
// //                 currentResponse = parsedResponse;
// //               } catch (parseError) {
// //                 console.error('Error parsing cleaned response:', parseError);
// //                 console.error('Problematic response text:', chunkData.generated_text);
// //               }
// //             }
            
// //             // If this is a token update and we haven't sent a complete response yet
// //             else if (chunkData.token && chunkData.token.text && !currentResponse) {
// //               // You can implement progressive updates here if needed
// //               // For now, we'll just accumulate tokens
// //             }
// //           } catch (error) {
// //             console.error('Error processing line:', error);
// //             console.error('Problematic line:', line);
// //           }
// //         }
// //       }
// //     });

// //     response.data.on('end', async () => {
// //       try {
// //         if (currentResponse) {
// //           // Update usage statistics
// //           await config.update({
// //             lastUsed: new Date(),
// //             requestCount: config.requestCount + 1,
// //           });
// //         }
        
// //         // For debugging purposes, log the complete accumulated response
// //         console.log('Complete accumulated chunks:', chunks.join(''));
        
// //         res.end();
// //       } catch (error) {
// //         console.error('Error in stream end handler:', error);
// //         res.end();
// //       }
// //     });

// //     response.data.on('error', (error) => {
// //       console.error('Stream error:', error);
// //       res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
// //       res.end();
// //     });

// //   } catch (error) {
// //     console.error("Error processing chat request:", error);
// //     const statusCode = error.response?.status || 500;
// //     const errorMessage = error.response?.data || error.message || "Internal server error";
    
// //     res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
// //     res.end();
// //   }
// // });



// // const handleChatRequest = asyncHandler(async (req, res, next) => {
// //   // Set headers for streaming
// //   res.setHeader('Content-Type', 'text/event-stream');
// //   res.setHeader('Cache-Control', 'no-cache');
// //   res.setHeader('Connection', 'keep-alive');

// //   try {
// //     // Input validation
// //     if (!req.body.Question) {
// //       throw new ErrorHandler("Missing required field: Question", 400);
// //     }
// //     const validQuestion = req.body.Question.toLowerCase();

// //     // Get active model configuration
// //     const config = await ModelConfig.findOne({
// //       where: {
// //         tenant_id: process.env.PREDIBASE_TENANT_ID,
// //         deployment_name: process.env.PREDIBASE_DEPLOYMENT,
// //         isActive: true,
// //       },
// //     });
// //     if (!config) {
// //       throw new ErrorHandler("Model configuration not found", 404);
// //     }

// //     // Construct the complete prompt
// //     const fullPrompt = `${BASE_PROMPT}${validQuestion}${PROMPT_SUFFIX}`;

// //     // Prepare streaming API request
// //     const apiUrl = `https://serving.app.predibase.com/${config.tenant_id}/deployments/v2/llms/${config.deployment_name}/generate`;

// //     const response = await axios({
// //       method: 'post',
// //       url: apiUrl,
// //       data: {
// //         inputs: fullPrompt,
// //         parameters: {
// //           adapter_source: config.adapter_source,
// //           adapter_id: config.adapter_id,
// //           max_new_tokens: 500,
// //           temperature: 0.2,
// //           top_p: 0.1,
// //         }
// //       },
// //       headers: {
// //         'Content-Type': 'application/json',
// //         'Authorization': `Bearer ${config.api_token}`,
// //       }
// //     });

// //     let accumulatedData = '';

// //     response.data.on('data', chunk => {
// //       try {
// //         const lines = chunk.toString().split('\n');
// //         lines.forEach(line => {
// //           if (line.trim() === '') return;

// //           // Remove "data: " prefix if present
// //           const jsonStr = line.replace(/^data: /, '');

// //           try {
// //             const data = JSON.parse(jsonStr);
// //             accumulatedData += data.generated_text || '';

// //             // Send the chunk to the client
// //             res.write(`data: ${JSON.stringify({ chunk: data.generated_text })}\n\n`);
// //           } catch (parseError) {
// //             console.error('Error parsing chunk:', parseError);
// //           }
// //         });
// //       } catch (streamError) {
// //         console.error('Error processing stream chunk:', streamError);
// //       }
// //     });

// //     response.data.on('end', async () => {
// //       try {
// //         // Update usage statistics
// //         await config.update({
// //           lastUsed: new Date(),
// //           requestCount: config.requestCount + 1,
// //         });

// //         // Try to parse the accumulated data as JSON
// //         const cleanedData = accumulatedData.trim();
// //         const parsedResponse = JSON.parse(cleanedData);

// //         if (parsedResponse.COT) {
// //           parsedResponse.COT = formatTripletsAsString(parsedResponse.COT);
// //         }

// //         // Send the final processed response
// //         res.write(`data: ${JSON.stringify({ final: parsedResponse })}\n\n`);
// //         res.end();
// //       } catch (finalizeError) {
// //         console.error('Error finalizing response:', finalizeError);
// //         res.write(`data: ${JSON.stringify({ error: 'Error processing final response' })}\n\n`);
// //         res.end();
// //       }
// //     });

// //     response.data.on('error', (error) => {
// //       console.error('Stream error:', error);
// //       res.write(`data: ${JSON.stringify({ error: 'Stream error occurred' })}\n\n`);
// //       res.end();
// //     });

// //   } catch (error) {
// //     console.error("Error processing chat request:", error);

// //     // Enhanced error handling
// //     const statusCode = error.response?.status || 500;
// //     const errorMessage = error.response?.data
// //       ? typeof error.response.data === "string"
// //         ? error.response.data
// //         : JSON.stringify(error.response.data)
// //       : error.message || "Internal server error";

// //     // Log detailed error information
// //     console.error({
// //       message: errorMessage,
// //       stack: error.stack,
// //       responseData: error.response?.data,
// //       status: statusCode
// //     });

// //     // Send error as SSE
// //     res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
// //     res.end();
// //   }
// // });

// module.exports = { handleChatRequest };
