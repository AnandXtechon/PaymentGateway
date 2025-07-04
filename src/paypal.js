const axios = require('axios');
require('dotenv').config();

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;

const BASE_URL = 'https://api-m.sandbox.paypal.com'; // use live URL in production

async function createPayPalOrder(amount, description) {
  const auth = await axios.post(`${BASE_URL}/v1/oauth2/token`, 'grant_type=client_credentials', {
    auth: {
      username: PAYPAL_CLIENT_ID,
      password: PAYPAL_SECRET,
    },
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const accessToken = auth.data.access_token;

  const order = await axios.post(`${BASE_URL}/v2/checkout/orders`, {
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: 'EUR',
          value: amount.toFixed(2),
        },
        description,
      },
    ],
  }, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  return order.data;
}

module.exports = { createPayPalOrder };
