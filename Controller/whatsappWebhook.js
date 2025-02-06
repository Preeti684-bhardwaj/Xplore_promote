const crypto = require("crypto");
const asyncHandler = require("../utils/asyncHandler");
require("dotenv").config();
const axios = require("axios");

// Validate webhook signature
// function validateSignature(payload, signature, webhookSecret) {
//   if (!signature) return false;

//   const expectedSignature = crypto
//     .createHmac("sha256", webhookSecret)
//     .update(JSON.stringify(payload))
//     .digest("hex");

//   return crypto.timingSafeEqual(
//     Buffer.from(signature.slice(7)), // Remove 'sha256=' prefix
//     Buffer.from(expectedSignature)
//   );
// }

// // Handle verification request
// function handleVerification(mode, token, challenge, verifyToken) {
//   if (mode === "subscribe" && token === verifyToken) {
//     console.log("Webhook verified");
//     console.log("data form webhook", challenge);
//     return { status: 200, data: challenge };
//   }
//   return { status: 403, data: { error: "Verification failed" } };
// }

// // Handle message events
// async function handleMessageEvent(event) {
//   try {
//     console.log("Processing message event:", event.message_id);
//     // Add your message handling logic here
//     // For example: saving to database, sending notifications, etc.
//   } catch (error) {
//     console.error("Error processing message event:", error);
//     throw error;
//   }
// }

// // Handle profile update events
// async function handleProfileUpdate(event) {
//   try {
//     console.log("Processing profile update:", event.user_id);
//     // Add your profile update handling logic here
//     // For example: updating user records, triggering notifications, etc.
//   } catch (error) {
//     console.error("Error processing profile update:", error);
//     throw error;
//   }
// }

// // Process webhook events
// async function processWebhookEvent(body) {
//   const eventType = body.type;

//   switch (eventType) {
//     case "message":
//       await handleMessageEvent(body);
//       break;
//     case "profile_update":
//       await handleProfileUpdate(body);
//       break;
//     default:
//       console.warn(`Unhandled webhook event type: ${eventType}`);
//   }

//   return { status: 200, data: { status: "received" } };
// }
const webhookEvent =asyncHandler(async (req, res) => {
    // log incoming messages
    console.log("Incoming webhook message:", JSON.stringify(req.body, null, 2));
  
    // check if the webhook request contains a message
    // details on WhatsApp text message payload: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#text-messages
    const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  
    // check if the incoming message contains text
    if (message?.type === "text") {
      // extract the business number to send the reply from it
      const business_phone_number_id =
        req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;
  
      // send a reply message as per the docs here https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
      await axios({
        method: "POST",
        url: `https://graph.facebook.com/v18.0/${business_phone_number_id}/messages`,
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
        },
        data: {
          messaging_product: "whatsapp",
          to: message.from,
          text: { body: "Echo: " + message.text.body },
          context: {
            message_id: message.id, // shows the message as a reply to the original user message
          },
        },
      });
  
      // mark incoming message as read
      await axios({
        method: "POST",
        url: `https://graph.facebook.com/v18.0/${business_phone_number_id}/messages`,
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
        },
        data: {
          messaging_product: "whatsapp",
          status: "read",
          message_id: message.id,
        },
      });
    }
  
    res.sendStatus(200);
  });
  

// Main webhook handler
const handleWebhook= asyncHandler(async(req,res)=> {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    // check the mode and token sent are correct
    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
      // respond with 200 OK and challenge token from the request
      res.status(200).send(challenge);
      console.log("Webhook verified successfully!");
    } else {
      // respond with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  } catch (error) {
    console.error("Webhook Error:", error);
    return { status: 500, data: { error: "Internal server error" } };
  }
});

module.exports = {
  handleWebhook,
  webhookEvent
};

// const crypto = require('crypto');

// crypto.randomBytes(10).toString("hex");

// class WebhookController {
//   constructor() {
//     // Store this securely in environment variables
//     this.webhookSecret = process.env.WEBHOOK_SECRET;
//   }

//   // Main handler function for webhook requests
//   async handleWebhook(req, res) {
//     try {
//       // Check if it's a verification request
//       if (req.query['hub.mode'] === 'subscribe') {
//         return this.handleVerification(req, res);
//       }

//       // Validate webhook signature
//       if (!this.validateSignature(req)) {
//         return res.status(401).json({ error: 'Invalid signature' });
//       }

//       // Process the webhook event
//       return this.processWebhookEvent(req, res);
//     } catch (error) {
//       console.error('Webhook Error:', error);
//       return res.status(500).json({ error: 'Internal server error' });
//     }
//   }

//   // Handle initial webhook verification
//   handleVerification(req, res) {
//     const mode = req.query['hub.mode'];
//     const token = req.query['hub.verify_token'];
//     const challenge = req.query['hub.challenge'];

//     // Verify that the mode and token are correct
//     if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
//       console.log('Webhook verified');
//       return res.status(200).send(challenge);
//     }

//     return res.status(403).json({ error: 'Verification failed' });
//   }

//   // Validate webhook signature
//   validateSignature(req) {
//     const signature = req.headers['x-hub-signature-256'];
//     if (!signature) return false;

//     // Get raw body (make sure body-parser is configured to provide raw body)
//     const payload = JSON.stringify(req.body);
//     const expectedSignature = crypto
//       .createHmac('sha256', this.webhookSecret)
//       .update(payload)
//       .digest('hex');

//     return crypto.timingSafeEqual(
//       Buffer.from(signature.slice(7)), // Remove 'sha256=' prefix
//       Buffer.from(expectedSignature)
//     );
//   }

//   // Process different types of webhook events
//   async processWebhookEvent(req, res) {
//     const { body } = req;
//     const eventType = body.type;

//     switch (eventType) {
//       case 'message':
//         await this.handleMessageEvent(body);
//         break;
//       case 'profile_update':
//         await this.handleProfileUpdate(body);
//         break;
//       default:
//         console.warn(`Unhandled webhook event type: ${eventType}`);
//     }

//     // Always return 200 to acknowledge receipt
//     return res.status(200).json({ status: 'received' });
//   }

//   // Handle incoming message events
//   async handleMessageEvent(event) {
//     try {
//       console.log('Processing message event:', event.message_id);
//       // Add your message handling logic here
//       // For example: saving to database, sending notifications, etc.
//     } catch (error) {
//       console.error('Error processing message event:', error);
//       throw error;
//     }
//   }

//   // Handle profile update events
//   async handleProfileUpdate(event) {
//     try {
//       console.log('Processing profile update:', event.user_id);
//       // Add your profile update handling logic here
//       // For example: updating user records, triggering notifications, etc.
//     } catch (error) {
//       console.error('Error processing profile update:', error);
//       throw error;
//     }
//   }
// }

// module.exports = WebhookController;
