const { createMollieClient } = require('@mollie/api-client');
const dotenv  = require('dotenv')
dotenv.config();

// ✅ Always use environment variables for secrets!
const mollieClient = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });

async function createPayment(amount, description) {
  return await mollieClient.payments.create({
    amount: {
      currency: 'EUR',
      value: Number(amount).toFixed(2),
    },
    description,
    redirectUrl: `http://localhost:3000/success?mollie_id=${payment.id}`, // ✅ Replace with your thank-you page
    webhookUrl: 'https://yourdomain.com/webhook', // ✅ Optional for status updates
    metadata: {
      orderId: `order-${Date.now()}`,
    },
  });
}

module.exports = { createPayment };
