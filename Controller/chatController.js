const axios = require("axios");
const OpenAI = require("openai");
const db = require("../dbConfig/dbConfig.js");
const ModelConfig = db.modelConfigs;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

// Define the base prompt template
const BASE_PROMPT = `You are a professional sales expert representing the Hyundai IONIQ 5. Engage with customers in a friendly, informative, and helpful manner, just as a dealership salesperson would during a consultation. Your knowledge is based strictly on the information associated with the UUID: d950614d-2b47-4c4f-b71b-0c61b5082471.

When answering questions:
1. Always provide detailed information on Hyundai IONIQ 5 pricing, features, specifications, and additional costs.
2. NEVER say "No information available" for pricing, trim levels, or feature-related questions.
3. Always include a MINIMUM of 2 OR 3 triplets in your response. A triplet consists of "<Subject>, <Predicate>, <Object>". For example: "Hyundai IONIQ 5, has, advanced safety features."
4. Greet customers warmly with gratitude when they say "hi", "hello", or similar words. For example, "Hello! Thank you for reaching out. How can I assist you with the Hyundai IONIQ 5 today?"

// Sales Strategy
- Understand the customer's requirements before making recommendations. Ask clarifying questions to tailor your response.
- Offer the best Hyundai IONIQ 5 trim based on their budget, performance, and feature needs.
- Upsell and suggest alternatives when necessary.
- Convince the customer to take action (schedule a test drive, apply for financing, or make a purchase) in a natural and engaging manner.

After answering the customer's question:
1. Generate two projected follow-up questions the customer might ask next. For example, "What are the financing options available?" or "Can I schedule a test drive?"
2. Format the complete response as JSON with the following sections:
   {
       "answer": "<Your short and concise, conversational answer>",
       "questions": [<Projected Question 1>, <Projected Question 2>],
       "summary": "<A summary of the previous 2 questions & responses, excluding the latest>"
   }

DO NOT return "No information available" for any details regarding pricing, colors, trim levels, or Hyundai IONIQ 5 features.

Maintain a conversational and professional tone throughout.

Customer's Question:`;

const PROMPT_SUFFIX = " Sales Expert's JSON Answer:";
const SUMMARY = " Previous Conversation Summary:";

const greetingWords = new Set([
  "hi",
  "hello",
  "hey",
  "good morning",
  "good afternoon",
  "namaste",
  "good evening",
  "greetings",
]);

// Store conversation history
let finalAnswerHistory = [];

// Helper functions
const isGreeting = (question) =>
  greetingWords.has(question.toLowerCase().trim());

const generateSummary = () => {
  if (finalAnswerHistory.length === 0) return "";
  if (finalAnswerHistory.length === 1)
    return `Previously, we discussed: ${finalAnswerHistory[0]}`;
  const lastTwo = finalAnswerHistory.slice(-2);
  return `Previously, we discussed: ${lastTwo[0]}. Additionally, we covered: ${lastTwo[1]}`;
};

const updateSummary = (response) => {
  const answer = response?.answer?.trim();
  if (answer && !isGreeting(answer)) {
    finalAnswerHistory.push(answer);
    if (finalAnswerHistory.length > 9) finalAnswerHistory.shift();
  }
};

const handleChatRequest = asyncHandler(async (req, res) => {
  try {
    if (!req.body.Question) {
      throw new ErrorHandler("Missing required field: Question", 400);
    }

    const question = req.body.Question.trim();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Handle greeting
    if (isGreeting(question)) {
      const response = {
        answer:
          "Hello! Welcome to Hyundai. How can I assist you with the IONIQ 5 today?",
        questions: [
          "What are the available trim levels for the IONIQ 5?",
          "What is the starting price of the IONIQ 5?",
        ],
        summary: generateSummary()
      };

      res.write(`data: ${JSON.stringify({ type: "start", question })}\n\n`);
      res.write(
        `data: ${JSON.stringify({
          type: "stream",
          content: response,
        })}\n\n`
      );
      res.write(`data: ${JSON.stringify(response)}\n\n`);
      updateSummary(response);
      res.write('data: {"type": "end"}\n\n');
      return res.end();
    }

    const config = await ModelConfig.findOne({
      where: {
        tenant_id: process.env.PREDIBASE_TENANT_ID,
        deployment_name: process.env.PREDIBASE_DEPLOYMENT,
        isActive: true,
      },
    });

    if (!config) throw new ErrorHandler("Model configuration not found", 404);
    
    const openai = new OpenAI({
      apiKey: config.api_token,
      baseURL: `https://serving.app.predibase.com/${config.tenant_id}/deployments/v2/llms/${config.deployment_name}/v1`,
    });

    const previousSummary = generateSummary();
    const fullPrompt = `${BASE_PROMPT}${question}${SUMMARY}${previousSummary}${PROMPT_SUFFIX}`;

    res.write(`data: ${JSON.stringify({ type: "start", question })}\n\n`);

    let accumulatedResponse = '';
    const stream = await openai.completions.create({
      model: config.adapter || "test/3",
      prompt: fullPrompt,
      max_tokens: 300,
      temperature: 0.2,
      top_p: 0.1,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.text || "";
      accumulatedResponse += token;
      res.write(
        `data: ${JSON.stringify({
          type: "stream",
          content: token,
        })}\n\n`
      );
    }

    // Parse the accumulated response and update summary
    try {
      const parsedResponse = JSON.parse(accumulatedResponse);
      updateSummary(parsedResponse);
    } catch (parseError) {
      console.error("Error parsing response:", parseError);
    }

    // Update model usage stats
    await config.update({
      lastUsed: new Date(),
      requestCount: config.requestCount + 1,
    });

    res.write('data: {"type": "end"}\n\n');
    res.end();
  } catch (error) {
    console.error("Error:", error);
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        error: error.message || "Internal server error",
      })}\n\n`
    );
    res.end();
  }
});

module.exports = { handleChatRequest };
