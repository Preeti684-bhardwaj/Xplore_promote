const axios = require('axios');
const crypto = require('crypto');
const { generateToken } = require("../validators/userValidation.js");

function generateAppSecretProof(accessToken, appSecret) {
  return crypto
    .createHmac('sha256', appSecret)
    .update(accessToken)
    .digest('hex');
}

function generateAuthLink(phoneNumber, state) {
  return `${process.env.APP_URL}/auth/callback?state=${state}&phone=${phoneNumber}`;
}

const sendWhatsAppLink = (data) => {
  const appSecretProof = generateAppSecretProof(process.env.ACCESS_TOKEN, process.env.FACEBOOK_APP_SECRET);
  const config = {
    method: 'post',
    url: `https://graph.facebook.com/${process.env.VERSION}/${process.env.PHONE_NUMBER_ID}/messages`,
    headers: {
      'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    params: {
      appsecret_proof: appSecretProof
    },
    data: data
  };

  return axios(config);
}

const getLinkMessageInput = (recipient, link, text) => {
  return JSON.stringify({
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": recipient,
    "type": "text",
    "text": {
      "preview_url": true,
      "body": `${text}\n${link}`
    }
  });
}

module.exports = {
  sendWhatsAppLink,
  getLinkMessageInput,
  generateAuthLink
};