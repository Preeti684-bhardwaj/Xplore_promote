const axios = require("axios");
const db = require("../dbConfig/dbConfig");
const WhatsappConfig = db.whatsappConfig;
const crypto = require("crypto");

//-------Get WhatsApp configuration for a specific campaign-----------------------
const getWhatsAppConfig = async (campaignId) => {
  try {
    // Find the configuration associated with this campaign
    const config = await WhatsappConfig.findOne({
      where: { campaignId },
      include: [
        {
          model: db.campaigns,
          as: "campaigns",
        }
      ]
    });

    if (!config) {
      throw new Error(`No WhatsApp configuration found for campaign ${campaignId}`);
    }

    return config;
  } catch (error) {
    console.error("Error fetching WhatsApp configuration:", error);
    throw error;
  }
};

// Generate authentication link using campaign-specific configuration
async function generateAuthLink(countryCode, phone, state, shortCode, layoutId) {
  try {
    // Get the campaign first
    const campaign = await db.campaigns.findOne({
      where: { shortCode },
    });
    
    if (!campaign) {
      throw new Error(`Campaign not found with shortCode: ${shortCode}`);
    }
    
    // Get the config for this campaign
    const config = await getWhatsAppConfig(campaign.campaignID);
    
    // Use the campaign-specific URL
    return `${process.env.PRODUCTION_BASE_URL}/api/v1/endUser/auth/callback?state=${state}&countryCode=${countryCode}&phone=${phone}&shortCode=${shortCode}&layoutId=${layoutId}`;
  } catch (error) {
    console.error("Error generating auth link:", error);
    throw error;
  }
}

//-----WhatsApp message using campaign-specific configuration
const sendWhatsAppMessage = async (data, campaignId) => {
  try {
    // Get the configuration for this campaign
    const config = await getWhatsAppConfig(campaignId);
    
    const apiConfig = {
      method: "post",
      url: `https://graph.facebook.com/${config.version}/${config.phone_number_id}/messages`,
      headers: {
        Authorization: `Bearer ${config.meta_app_access_token}`,
        "Content-Type": "application/json",
      },
      data: data,
    };
    
    const response = await axios(apiConfig);
    return response;
  } catch (error) {
    console.error("WhatsApp API Error:", {
      status: error.response?.status,
      data: error.response?.data,
      headers: error.response?.headers,
    });
    throw error;
  }
};

// Generate OTP message template with campaign-specific details
const getOtpMessage = async (recipient, text, campaignId) => {
  // Get the configuration for this campaign
  const config = await getWhatsAppConfig(campaignId);
  
  // Use the template_name from the config instead of hardcoded value
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
    type: "template",
    template: {
      name: config.otp_template_name || "xplore_whatsapp_otp_login", // Use template_name from config
      language: {
        code: "en",
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: `${text}`,
            },
          ],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [
            {
              type: "text",
              text: `${text}`,
            },
          ],
        },
      ],
    },
  };
};

// Generate link message template with campaign-specific details
const getLinkMessageInput = async (recipient, link, campaignId) => {
  // Get the configuration for this campaign
  const config = await getWhatsAppConfig(campaignId);
  
  // Ensure the link is properly encoded
  const encodedLink = encodeURI(link);
  console.log(encodedLink);

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
    type: "template",
    template: {
      name: config.link_template_name || "xplorebuzz_whatsapp_login", // Use template_name from config
      language: {
        code: "en"
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              parameter_name: "login_link",
              text: `${encodedLink}`,
            },
          ],
        },
      ],
    },
  };
};

// Parse signed request with campaign-specific app secret
async function parseSignedRequest(signedRequest, campaignId) {
  try {
    if (!signedRequest || typeof signedRequest !== "string") {
      throw new Error("Invalid signed request format");
    }

    // Get the configuration for this campaign
    const config = await getWhatsAppConfig(campaignId);
    
    const parts = signedRequest.split(".");
    if (parts.length !== 2) {
      throw new Error("Invalid signed request structure");
    }

    const [encodedSig, payload] = parts;

    // Verify signature using the campaign-specific app secret
    // Note: You might need to add a facebook_app_secret field to your WhatsappConfig model
    const sig = base64UrlDecode(encodedSig);
    const expectedSig = crypto
      .createHmac("sha256", config.facebook_app_secret || "")
      .update(payload)
      .digest("base64");

    if (sig !== expectedSig) {
      throw new Error("Invalid signature");
    }

    const data = JSON.parse(base64UrlDecode(payload));

    // Validate required fields
    if (!data.user_id || !data.algorithm || data.algorithm !== "HMAC-SHA256") {
      throw new Error("Missing or invalid required fields");
    }

    return data;
  } catch (error) {
    console.error("Error parsing signed request:", error);
    return null;
  }
}

// Base64 URL decode helper function
function base64UrlDecode(input) {
  try {
    input = input.replace(/-/g, "+").replace(/_/g, "/");
    const padding = 4 - (input.length % 4);
    if (padding !== 4) {
      input += "=".repeat(padding);
    }
    return Buffer.from(input, "base64").toString("utf-8");
  } catch (error) {
    console.error("Error decoding base64:", error);
    return null;
  }
}

module.exports = {
  sendWhatsAppMessage,
  getLinkMessageInput,
  generateAuthLink,
  getWhatsAppConfig,
  getOtpMessage,
  parseSignedRequest
};
