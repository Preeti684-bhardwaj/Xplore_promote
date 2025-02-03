const axios = require('axios');
const crypto = require('crypto');

function generateAppSecretProof(accessToken, appSecret) {
  return crypto
    .createHmac('sha256', appSecret)
    .update(accessToken)
    .digest('hex');
}

function generateAuthLink(phoneNumber, state) {
  return `${process.env.APP_URL}/auth/callback?state=${state}&phone=${phoneNumber}`;
}

const sendWhatsAppLink = async (data) => {
  // Generate appsecret_proof
  const appSecretProof = generateAppSecretProof(
    process.env.ACCESS_TOKEN,
    process.env.FACEBOOK_APP_SECRET
  );
  const config = {
    method: 'post',
    url: `https://graph.facebook.com/${process.env.VERSION}/${process.env.PHONE_NUMBER_ID}/messages`,
    headers: {
      'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    // params: {
    //   appsecret_proof: appSecretProof
    // },
    data: data
  };
  try {
    const response = await axios(config);
    return response;
  } catch (error) {
    console.error('WhatsApp API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      headers: error.response?.headers
    });
    throw error;
  }
}
const getLinkMessageInput = (recipient, link, text) => {
  // Validate phone number format
  if (!recipient.startsWith('+')) {
    recipient = '+' + recipient;
  }

  // Ensure the link is properly encoded
  const encodedLink = encodeURI(link);

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
    type: "text",
    text: {
      preview_url: true,
      body: `${text}\n${encodedLink}`
    }
  };
}

module.exports = {
  sendWhatsAppLink,
  getLinkMessageInput,
  generateAuthLink
};