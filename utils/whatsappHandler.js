const axios = require("axios");
const crypto = require("crypto");

function generateAppSecretProof(accessToken, appSecret) {
  return crypto
    .createHmac("sha256", appSecret)
    .update(accessToken)
    .digest("hex");
}
function generateAuthLink(phoneNumber, state) {
  return `${process.env.APP_URL}/auth/callback?state=${state}&phone=${phoneNumber}`;
}

const sendWhatsAppLink = async (data) => {
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

const getLinkMessageInput = (recipient, link, text) => {
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
        code: "en",
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              parameter_name: "customer_name",
              text: "Samad",
            },
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

module.exports = {
  sendWhatsAppLink,
  getLinkMessageInput,
  generateAuthLink,
  getOtpMessage,
};
