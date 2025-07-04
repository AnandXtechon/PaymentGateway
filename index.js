const express = require("express")
const cors = require("cors")
const dotenv = require("dotenv")
const { createStripeCheckoutSession } = require("./src/stripe.js")
const { createPayment: createMolliePayment } = require("./src/mollie.js")
const { router: webhookRoutes, paymentStore } = require("./src/webhook.js")
const Stripe = require("stripe")
const StripePayment = require("./src/models/stripePayement.model.js")
const connectDB = require("./src/db.js")
const bodyParser = require("body-parser")
const { createAdyenPaymentSession } = require("./src/adyen.js")
const fetch = require("node-fetch")
const axios = require("axios")
const { default: createMollieClient } = require("@mollie/api-client")

dotenv.config()

const stripe = Stripe(process.env.STRIPE_SECRET_KEY)
const mollieClient = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY })

const app = express()

app.use(cors())
app.use("/webhooks", bodyParser.raw({ type: "application/json" }), webhookRoutes)
app.use(express.json())

// Helper function to get proper redirect URL
const getRedirectUrl = (paymentId = null) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173"

  // For development, you might need to use ngrok or a similar service
  // For production, make sure to use HTTPS
  if (paymentId) {
    return `${frontendUrl}/success?mollie_id=${paymentId}`
  }

  // Temporary redirect URL for initial creation
  return `${frontendUrl}/success`
}

// Helper function to get webhook URL
const getWebhookUrl = () => {
  const webhookUrl = process.env.WEBHOOK_URL

  if (!webhookUrl || webhookUrl.includes("yourdomain.com")) {
    console.warn("⚠️  WEBHOOK_URL not properly configured. Webhooks will not work.")
    return null // Don't set webhook URL if not properly configured
  }

  return `${webhookUrl}/webhooks/mollie`
}

// Adyen Payment
app.post("/create-payment/adyen", async (req, res) => {
  const { amount, description } = req.body
  try {
    const session = await createAdyenPaymentSession(amount, description)
    res.json(session)
  } catch (err) {
    console.error("Adyen Error:", err.message)
    res.status(500).json({ error: "Adyen checkout failed" })
  }
})

// Stripe Checkout Payment
app.post("/create-payment/stripe", async (req, res) => {
  const { amount, description } = req.body
  try {
    const session = await createStripeCheckoutSession(amount, description)
    res.json({ checkoutUrl: session.url })
  } catch (err) {
    console.error("Stripe Error:", err)
    res.status(500).json({ error: "Stripe checkout failed" })
  }
})

app.get("/stripe-session/:sessionId", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId, {
      expand: ["line_items", "payment_intent"],
    })
    console.log(session)
    res.json(session)
  } catch (err) {
    console.error("Stripe fetch error:", err.message)
    res.status(500).json({ error: "Failed to fetch Stripe session" })
  }
})

// FIXED: Mollie Payment Implementation
app.post("/create-payment/mollie", async (req, res) => {
  const { amount, description } = req.body

  try {
    // Validate amount
    const numericAmount = Number(amount)
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount provided" })
    }

    // Generate a unique order ID
    const orderId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Create payment with proper configuration
    const paymentData = {
      amount: {
        currency: "EUR",
        value: numericAmount.toFixed(2),
      },
      description: description || "Payment",
      redirectUrl: getRedirectUrl(), // Use base URL first
      metadata: {
        orderId: orderId,
      },
    }

    // Only add webhook URL if properly configured
    const webhookUrl = getWebhookUrl()
    if (webhookUrl) {
      paymentData.webhookUrl = webhookUrl
    }

    const payment = await mollieClient.payments.create(paymentData)

    console.log(`✅ Mollie payment created: ${payment.id}`)

    // Now update with the specific redirect URL containing the payment ID
    try {
      const updatedPayment = await mollieClient.payments.update(payment.id, {
        redirectUrl: getRedirectUrl(payment.id),
      })
      console.log(`✅ Mollie payment redirect URL updated: ${payment.id}`)
    } catch (updateError) {
      console.warn("⚠️  Could not update redirect URL, using original payment:", updateError.message)
      // Continue with original payment if update fails
    }

    const checkoutUrl = payment._links?.checkout?.href

    if (checkoutUrl) {
      res.json({
        checkoutUrl,
        paymentId: payment.id,
        orderId: orderId,
      })
    } else {
      console.error("❌ No checkout URL returned from Mollie")
      res.status(500).json({ error: "No checkout URL returned" })
    }
  } catch (err) {
    console.error("❌ Mollie Payment Error:", err.message || err)

    // Provide more specific error messages
    let errorMessage = "Mollie payment failed"
    let errorDetails = err.message

    if (err.field === "redirectUrl") {
      errorMessage = "Invalid redirect URL configuration"
      errorDetails = `The redirect URL is not valid. Make sure FRONTEND_URL is set to a valid URL. Current: ${process.env.FRONTEND_URL || "http://localhost:5173"}`
    } else if (err.field === "webhookUrl") {
      errorMessage = "Invalid webhook URL configuration"
      errorDetails = `The webhook URL is not valid. Current: ${getWebhookUrl() || "Not set"}`
    }

    res.status(500).json({
      error: errorMessage,
      details: errorDetails,
      field: err.field || "unknown",
    })
  }
})

app.get("/mollie-session/:paymentId", async (req, res) => {
  const { paymentId } = req.params

  console.log(`🔍 Fetching Mollie payment: ${paymentId}`)

  // Validate payment ID format
  if (!paymentId || paymentId === "{id}" || paymentId.includes("{") || paymentId.includes("}")) {
    console.error(`❌ Invalid payment ID format: ${paymentId}`)
    return res.status(400).json({
      error: "Invalid payment ID format",
      details: `Received payment ID: ${paymentId}`,
    })
  }

  try {
    const payment = await mollieClient.payments.get(paymentId)
    console.log(`✅ Successfully fetched Mollie payment: ${paymentId}`)
    console.log(payment)
    res.json(payment)
  } catch (err) {
    console.error("❌ Mollie fetch error:", err.message)
    console.error("Payment ID that caused error:", paymentId)
    res.status(500).json({
      error: "Failed to fetch Mollie payment session",
      paymentId: paymentId,
      details: err.message,
    })
  }
})

// Add a test endpoint to validate URLs
app.get("/test-mollie-config", (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173"
  const webhookUrl = getWebhookUrl()

  res.json({
    frontendUrl,
    webhookUrl: webhookUrl || "Not configured",
    redirectUrl: getRedirectUrl("test_payment_id"),
    mollieApiKey: process.env.MOLLIE_API_KEY ? "Set" : "Not set",
    isLocalhost: frontendUrl.includes("localhost"),
    recommendations: {
      forDevelopment: "Consider using ngrok to create a public URL for testing",
      forProduction: "Make sure to use HTTPS URLs",
    },
  })
})






const startServer = async () => {
  await connectDB()
  const PORT = process.env.PORT || 3000
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`)
    console.log(`📋 Test Mollie config at: http://localhost:${PORT}/test-mollie-config`)
  })
}

startServer()
