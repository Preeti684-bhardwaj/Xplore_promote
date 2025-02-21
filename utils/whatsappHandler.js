const axios = require("axios");

//--------------generating auth link---------------------------------------------
function generateAuthLink(countryCode, phone, state , shortCode,layoutId) {
  return `${process.env.APP_URL}/auth/callback?state=${state}&countryCode=${countryCode}&phone=${phone}&shortCode=${shortCode}&layoutId=${layoutId}`;
}

// ---------------send message on whatsapp-------------------------------------
const sendWhatsAppMessage = async (data) => {
  const config = {
    method: "post",
    url: `https://graph.facebook.com/${process.env.VERSION}/${process.env.PHONE_NUMBER_ID}/messages`,
    headers: {
      Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    data: data,
  };
  try {
    const response = await axios(config);
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

// -------------generate data payload as per otp based meta template-----------------------------
const getOtpMessage = (recipient, text) => {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
    type: "template",
    template: {
      name: "xplore_whatsapp_otp_login",
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

// ---------generate data payload as per link based meta template----------------------------------
const getLinkMessageInput = (recipient, link) => {
  // Ensure the link is properly encoded
  const encodedLink = encodeURI(link);
  console.log(encodedLink);

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
    type: "template",
    template: {
      name: "xplorebuzz_whatsapp_login",
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
                  text:  `${encodedLink}`,
            },
          ],
        },
      ],
    },
  };
};

//---------Enhanced Facebook signed request parsing with security checks------------------------------
function parseSignedRequest(signedRequest) {
  try {
    if (!signedRequest || typeof signedRequest !== "string") {
      throw new Error("Invalid signed request format");
    }

    const parts = signedRequest.split(".");
    if (parts.length !== 2) {
      throw new Error("Invalid signed request structure");
    }

    const [encodedSig, payload] = parts;

    // Verify signature (add your app secret here)
    const sig = base64UrlDecode(encodedSig);
    const expectedSig = crypto
      .createHmac("sha256", process.env.FACEBOOK_APP_SECRET)
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

//-----------base64 url decode------------------------------------
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
  getOtpMessage,
  parseSignedRequest
};
