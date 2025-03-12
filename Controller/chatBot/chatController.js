const axios = require("axios");
const OpenAI = require("openai");
const db = require("../../dbConfig/dbConfig.js");
const ChatBotConfig = db.chatBotConfig;
const ErrorHandler = require("../../utils/ErrorHandler.js");
const asyncHandler = require("../../utils/asyncHandler.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const PROMPT_SUFFIX = " Sales Expert's JSON Answer:";
const SUMMARY = " Previous Conversation Summary:";

const greetingWords = new Set([
  "hii",
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

// Add JSON extraction utility
function extractJson(str) {
  try {
    // Handle possible code block formatting
    const jsonMatch = str.match(/{[\s\S]*}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (e) {
    return null;
  }
}
// Gemini-specific handler
async function handleGeminiRequest(config, question, res, next) {
  try {
    const openai = new OpenAI({
      apiKey: config.api_key,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });

    const BASE_PROMPT = config.base_prompt;
    const previousSummary = generateSummary();
    const cacheName = config.otherDetails.cache_name;

    res.write(`data: ${JSON.stringify({ type: "start", question })}\n\n`);

    let accumulatedResponse = "";
    const stream = await openai.chat.completions.create({
      model: "gemini-1.5-flash-001", // Use the appropriate Gemini model
      messages: [
        {
          role: "system",
          content:BASE_PROMPT,
        },
        {
          role: "user",
          content: `${question}${SUMMARY}${previousSummary}`,
        },
      ],
      temperature: 0.2,
      top_p: 0.1,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || "";
      accumulatedResponse += token;
      res.write(
        `data: ${JSON.stringify({
          type: "stream",
          content: token,
        })}\n\n`
      );
    }

    // Parse structured response
    const jsonData = extractJson(accumulatedResponse) || {};
    const parsedResponse = {
      answer: jsonData.answer || accumulatedResponse,
      questions: jsonData.questions || [
        "Would you like more details?",
        "Any other aspects you're interested in?",
      ],
      summary: previousSummary,
    };

    updateSummary(parsedResponse);

    // res.write(`data: ${JSON.stringify({
    //   type: "complete",
    //   response: parsedResponse
    // })}\n\n`);

    res.write('data: {"type": "end"}\n\n');
    res.end();
  } catch (error) {
    console.error("Gemini Error:", error);
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        error: error.message || "Failed to generate response",
      })}\n\n`
    );
    res.end();
  }
}

const handleChatRequest = asyncHandler(async (req, res, next) => {
  try {
    const { campaignId } = req.query;
    if (!req.body.Question) {
      return next(new ErrorHandler("Missing required field: Question", 400));
    }

    const question = req.body.Question.toLowerCase().trim();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const config = await ChatBotConfig.findOne({
      where: { campaignId },
    });

    if (!config) return next(new ErrorHandler("Configuration not found", 404));

    // Handle different providers
    if (config.provider === "predibase") {
      // Handle greeting
      if (isGreeting(question)) {
        const response = {
          answer:
            "Hello! Welcome to Hyundai. How can I assist you with the IONIQ 5 today?",
          questions: [
            "What are the available trim levels for the IONIQ 5?",
            "What is the starting price of the IONIQ 5?",
          ],
          summary: generateSummary(),
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

      const BASE_PROMPT = config.base_prompt;
      const openai = new OpenAI({
        apiKey: config.api_key,
        baseURL: `https://serving.app.predibase.com/${config.otherDetails.tenant_id}/deployments/v2/llms/${config.name}/v1`,
      });

      const previousSummary = generateSummary();
      const fullPrompt = `${BASE_PROMPT}${question}${SUMMARY}${previousSummary}${PROMPT_SUFFIX}`;

      res.write(`data: ${JSON.stringify({ type: "start", question })}\n\n`);
      console.log("line 189",config.otherDetails.adapter_id);

      let accumulatedResponse = "";
      const stream = await openai.completions.create({
        model: config.otherDetails.adapter_id,
        prompt: fullPrompt,
        max_tokens: config.otherDetails.max_new_tokens ,
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
        const parsedResponse = accumulatedResponse;
        updateSummary(parsedResponse);
      } catch (parseError) {
        console.error("Error parsing response:", parseError);
      }
      res.write('data: {"type": "end"}\n\n');
      res.end();
    } else if (config.provider === "gemini") {
      await handleGeminiRequest(config, question, res, next);
    }
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
