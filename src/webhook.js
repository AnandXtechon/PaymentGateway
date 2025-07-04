const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const dotenv = require('dotenv');
const StripePayment = require('./models/stripePayement.model.js');

dotenv.config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const data = event.data.object;
  console.log(`📦 Received event: ${event.type}`);
  console.log(JSON.stringify(data, null, 2));

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        try {
          await StripePayment.create({
            sessionId: data.id,
            paymentIntentId: data.payment_intent,
            customerEmail: data.customer_email,
            amountTotal: data.amount_total,
            currency: data.currency,
            paymentStatus: data.payment_status, // ✅ field matches schema now
          });
          console.log('✅ Saved checkout.session.completed:', data.id);
        } catch (err) {
          console.error('❌ DB Save Failed (checkout.session.completed):', err.message);
        }
        break;
      }

      case 'payment_intent.succeeded': {
        await StripePayment.findOneAndUpdate(
          { paymentIntentId: data.id },
          {
            paymentStatus: data.status,
            updated: new Date(),
          }
        );
        console.log('✅ PaymentIntent succeeded:', data.id);
        break;
      }

      case 'payment_intent.payment_failed': {
        const error = data.last_payment_error?.message;
        await StripePayment.findOneAndUpdate(
          { paymentIntentId: data.id },
          {
            paymentStatus: 'failed',
            error,
            updated: new Date(),
          }
        );
        console.warn('❌ Payment failed:', data.id, error);
        break;
      }

      case 'charge.updated': {
        await StripePayment.findOneAndUpdate(
          { paymentIntentId: data.payment_intent },
          {
            chargeId: data.id,
            receiptUrl: data.receipt_url,
            paymentStatus: data.status,
            paymentMethodType: data.payment_method_details?.type || '',
            billingDetails: {
              name: data.billing_details?.name || '',
              email: data.billing_details?.email || '',
              address: data.billing_details?.address || {},
            },
          },
          { new: true, upsert: true }
        );
        console.log('📃 Charge updated:', data.id);
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('❌ Webhook Handler Error:', err.message);
  }

  res.json({ received: true });
});

module.exports = { router };
