const mongoose = require('mongoose');

const StripePaymentSchema = new mongoose.Schema({
  sessionId: String,
  paymentIntentId: String,
  chargeId: String,
  customerEmail: String,
  amountTotal: Number,
  currency: String,
  paymentStatus: String, // succeeded, failed
  paymentMethodType: String,
  receiptUrl: String,
  billingDetails: {
    name: String,
    email: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postal_code: String,
      country: String,
    },
  },
  errorMessage: String,
  // For failed payments
}, {
  timestamps: true, // Adds createdAt and updatedAt
});

module.exports = mongoose.model('StripePayment', StripePaymentSchema);
