const axios = require("axios");
const OpenAI = require("openai");
const db = require("../dbConfig/dbConfig.js");
const ChatBotConfig = db.chatBotConfig;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");


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


const handleChatRequest = asyncHandler(async (req, res,next) => {
  try {
    const {campaignId}=req.query
    if (!req.body.Question) {
      return next(
        new ErrorHandler("Missing required field: Question", 400));
    }

    const question = req.body.Question.toLowerCase().trim();

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

    const config = await ChatBotConfig.findOne({
      where: {
        campaignId: campaignId
      },
    });

    if (!config){
      return next(
        new ErrorHandler("Configuration not found", 404));
    }
    console.log(config.otherDetails.tenant_id);
    console.log(config.otherDetails.deployment_name);

    
    const BASE_PROMPT=config.base_prompt
    const openai = new OpenAI({
      apiKey: config.api_key,
      baseURL: `https://serving.app.predibase.com/${config.otherDetails.tenant_id}/deployments/v2/llms/${config.otherDetails.deployment_name}/v1`,
    });

    const previousSummary = generateSummary();
    const fullPrompt = `${BASE_PROMPT}${question}${SUMMARY}${previousSummary}${PROMPT_SUFFIX}`;

    res.write(`data: ${JSON.stringify({ type: "start", question })}\n\n`);

    let accumulatedResponse = '';
    const stream = await openai.completions.create({
      model:config.otherDetails.adapter_id,
      prompt: fullPrompt,
      max_tokens: config.otherDetails.max_new_tokens,
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
      const parsedResponse =accumulatedResponse;
      updateSummary(parsedResponse);
    } catch (parseError) {
      console.error("Error parsing response:", parseError);
    }

    // Update model usage stats
    // await config.update({
    //   lastUsed: new Date(),
    //   requestCount: config.requestCount + 1,
    // });

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
