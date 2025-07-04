// src/adyen.js
// This file handles the backend logic for creating Adyen payment sessions.

// Import necessary modules from the Adyen API library
// Removed SessionsApi import as it's not a direct constructor
const { Client, Config, CheckoutAPI } = require('@adyen/api-library');
// Load environment variables from .env file
require('dotenv').config();

// Initialize Adyen configuration
const config = new Config();
// Set API key from environment variables
config.apiKey = process.env.ADYEN_API_KEY;
// Set environment to 'TEST' or 'LIVE'
config.environment = 'TEST'; // Ensure this matches your Adyen account environment
// Set your Adyen merchant account name
config.merchantAccount = process.env.ADYEN_MERCHANT_ACCOUNT;

// Create an Adyen client instance with the configured settings
const client = new Client({ config });
// Initialize the CheckoutAPI with the client
const checkout = new CheckoutAPI(client);

/**
 * Creates an Adyen payment session.
 * @param {number} amount - The amount for the payment (e.g., 10.00 for 10 EUR).
 * @param {string} reference - A unique reference for the payment.
 * @returns {Promise<object>} - The response body containing id and sessionData.
 */
async function createAdyenPaymentSession(amount, reference) {
  try {
    // Call the create method directly on checkout.sessions
    // This is the standard way to create sessions in modern Adyen Node.js SDK versions.
    const { body } = await checkout.sessions.create({
      // Payment amount details
      amount: { currency: 'EUR', value: Math.round(amount * 100) }, // Amount in minor units (e.g., cents)
      countryCode: 'NL', // Country code for the payment
      merchantAccount: config.merchantAccount, // Your merchant account
      reference, // Unique reference for the transaction
      returnUrl: 'http://localhost:5173/success', // URL to redirect after payment completion
    });
    return body; // Returns the session ID and session data
  } catch (error) {
    console.error("Adyen Error creating session:", error);
    // Re-throw the error to be handled by the calling function
    throw new Error(`Failed to create Adyen session: ${error.message}`);
  }
}

// Export the function for use in other modules
module.exports = { createAdyenPaymentSession };
