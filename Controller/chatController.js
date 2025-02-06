const axios = require("axios");
const OpenAI = require("openai");
const db = require("../dbConfig/dbConfig.js");
const ModelConfig = db.modelConfigs;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");

// Define the base prompt template
const BASE_PROMPT = `You are a Hyundai IONIQ 5 sales expert, trained to engage with customers in a persuasive, friendly, and professional manner. Your knowledge is based strictly on the information associated with the UUID: d950614d-2b47-4c4f-b71b-0c61b5082471.

// Sales Strategy
- Understand the customer's requirements before making recommendations.
- Offer concise, clear answers in *2-3 sentences* maximum.
- Upsell & suggest alternatives when necessary.
- Convince the customer to take action (schedule a test drive, apply for financing, or make a purchase).
- Never say "No information available" about features, pricing, or trim levels.

// Expected Response Format (JSON)
- *If this is the first customer question, DO NOT include the summary.* Only return the finalAnswer and projectedQuestions.
- *For all subsequent questions, include the summary using the following structure:*
    - *Previously, we discussed:* <First Summary>
    - *Additionally, we covered:* <Second Summary>

{
    "summary": "<Formatted summary here if not first question>",
    "answer": "<Concise and informative answer>",
    "questions":["Follow-up question 1", "Follow-up question 2"]
} Customer's Question:`;

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
      };

      res.write(`data: ${JSON.stringify({ type: "start", question })}\n\n`);
      res.write(
        `data: ${JSON.stringify({
          type: "stream",
          content: response.answer,
        })}\n\n`
      );
      res.write(`data: ${JSON.stringify(response)}\n\n`);
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

    // Tracking variables for the complete response
    let responseData = {
      summary: previousSummary || undefined, // Only include if there's a previous summary
      answer: "",
      questions: [],
    };
    let collectingQuestions = false;
    let questionBuffer = "";
    let lastToken = "";

    res.write(`data: ${JSON.stringify({ type: "start", question })}\n\n`);

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

      // Handle section markers
      if (token.includes("questions")) {
        collectingQuestions = true;
        continue;
      }

      // Process the token based on section
      if (collectingQuestions) {
        if (token.includes("[") || token.includes("]")) continue;

        questionBuffer += token;
        if (token.includes("?")) {
          const cleanedQuestion = questionBuffer
            .replace(/[",]/g, "")
            .trim()
            .replace(/\s+/g, " ");
          responseData.questions.push(cleanedQuestion);
          questionBuffer = "";
        }
      } else {
        // Handle answer section
        let cleanToken = token
          .replace(/[{}"]/g, "")
          .replace(/^answer\s*:\s*/, "") // Remove "answer:" prefix
          .trim();

        if (cleanToken) {
          // Fix spacing for specific tokens
          if (cleanToken === "IONIQ") {
            cleanToken = "IONIQ";
          } else if (cleanToken.startsWith("IONIQ")) {
            cleanToken = " IONIQ" + cleanToken.slice(5);
          }

          // Add space between tokens if needed
          const needsSpace =
            lastToken &&
            !lastToken.endsWith(" ") &&
            !cleanToken.startsWith(" ") &&
            !lastToken.endsWith("-") &&
            !lastToken.endsWith(".") &&
            !lastToken.endsWith(",");

          if (needsSpace) {
            responseData.answer += " ";
          }

          responseData.answer += cleanToken;

          // Stream the token with proper spacing
          res.write(
            `data: ${JSON.stringify({
              type: "stream",
              content: needsSpace ? " " + cleanToken : cleanToken,
            })}\n\n`
          );

          lastToken = cleanToken;
        }
      }
    }

    // Clean up final response
    responseData.answer = responseData.answer
      .replace(/\s+/g, " ")
      .replace(/\s+([.,])/g, "$1")
      .trim();

    // Send only the questions in the final response
    const finalResponse = {
      questions: responseData.questions,
    };

    res.write(`data: ${JSON.stringify(finalResponse)}\n\n`);

    // Update model usage stats
    await config.update({
      lastUsed: new Date(),
      requestCount: config.requestCount + 1,
    });

    updateSummary(responseData);
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
