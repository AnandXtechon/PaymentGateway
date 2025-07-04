const Stripe = require('stripe');
const dotenv = require('dotenv');

dotenv.config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
async function createStripeCheckoutSession(amount, description) {
  return stripe.checkout.sessions.create({
    payment_method_types: [
      "card",
      "ideal",
      "bancontact",
      "sofort",
      "giropay",
      "eps"
    ],
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: description,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: 'http://localhost:5173/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'http://localhost:5173/success?session_id={CHECKOUT_SESSION_ID}',
  });
}

module.exports = { createStripeCheckoutSession };