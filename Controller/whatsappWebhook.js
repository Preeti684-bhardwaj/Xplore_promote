const crypto = require('crypto');
require("dotenv").config();

// Validate webhook signature
function validateSignature(payload, signature, webhookSecret) {
  if (!signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature.slice(7)), // Remove 'sha256=' prefix
    Buffer.from(expectedSignature)
  );
}

// Handle verification request
function handleVerification(mode, token, challenge, verifyToken) {
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Webhook verified');
    return { status: 200, data: challenge };
  }
  return { status: 403, data: { error: 'Verification failed' } };
}

// Handle message events
async function handleMessageEvent(event) {
  try {
    console.log('Processing message event:', event.message_id);
    // Add your message handling logic here
    // For example: saving to database, sending notifications, etc.
  } catch (error) {
    console.error('Error processing message event:', error);
    throw error;
  }
}

// Handle profile update events
async function handleProfileUpdate(event) {
  try {
    console.log('Processing profile update:', event.user_id);
    // Add your profile update handling logic here
    // For example: updating user records, triggering notifications, etc.
  } catch (error) {
    console.error('Error processing profile update:', error);
    throw error;
  }
}

// Process webhook events
async function processWebhookEvent(body) {
  const eventType = body.type;

  switch (eventType) {
    case 'message':
      await handleMessageEvent(body);
      break;
    case 'profile_update':
      await handleProfileUpdate(body);
      break;
    default:
      console.warn(`Unhandled webhook event type: ${eventType}`);
  }

  return { status: 200, data: { status: 'received' } };
}

// Main webhook handler
async function handleWebhook(req) {
  try {
    // Check if it's a verification request
    if (req.query['hub.mode']) {
      return handleVerification(
        req.query['hub.mode'],
        req.query['hub.verify_token'],
        req.query['hub.challenge'],
        process.env.VERIFY_TOKEN
      );
    }

    // Validate webhook signature
    const isValid = validateSignature(
      req.body,
      req.headers['x-hub-signature-256'],
      process.env.WEBHOOK_SECRET
    );

    if (!isValid) {
      return { status: 401, data: { error: 'Invalid signature' } };
    }

    // Process the webhook event
    return await processWebhookEvent(req.body);
  } catch (error) {
    console.error('Webhook Error:', error);
    return { status: 500, data: { error: 'Internal server error' } };
  }
}

module.exports = {
  handleWebhook
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