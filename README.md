# Backend Payment API – Stripe & Mollie

A Node.js Express backend providing seamless payment integrations with **Stripe** and **Mollie**. Easily process payments, receive webhooks, and manage sessions using unified, documented endpoints.

---

## Table of Contents

- [Features](#features)
- [Installed Packages](#installed-packages)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Endpoints & Full Route Code](#api-endpoints--full-route-code)
  - [Stripe Payments Flow](#stripe-payments-flow)
  - [Mollie Payments Flow](#mollie-payments-flow)
- [Webhooks](#webhooks)
- [Testing & Diagnostics](#testing--diagnostics)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- **Stripe Checkout workflow**: Create sessions, track payment state, full webhooks support.
- **Mollie Payment workflow**: Create payments, manage redirects, fetch sessions, webhook handling.
- **Unified REST API** for fast integration with your frontend platform.
- **Environment config** for secrets and URLs.
- **Extensible structure** for new payment providers if needed.

---

## Installed Packages

Below are the core npm packages installed and used for Stripe and Mollie integrations:

### Stripe

| Package       | Purpose                                                      |
|---------------|-------------------------------------------------------------|
| `stripe`      | Official Stripe Node.js SDK for server-side integration ([npm](https://www.npmjs.com/package/stripe))                  |
| `@stripe/stripe-js` | Official Stripe JS client for frontend integration (`frontend/` only; not used directly in the backend)           |

### Mollie

| Package                  | Purpose                                                      |
|--------------------------|-------------------------------------------------------------|
| `@mollie/api-client`     | Official Mollie API client for server-side integration ([npm](https://www.npmjs.com/package/@mollie/api-client))           |

### General Server Packages

These are general dependencies required for server and HTTP routing (not payment-provider-specific):

| Package        | Purpose                      |
|----------------|-----------------------------|
| `express`      | Node.js web server          |
| `cors`         | CORS middleware             |
| `dotenv`       | Loads .env variables        |
| `body-parser`  | Raw/JSON request parsing    |
| `mongoose`     | MongoDB ORM (for session/data storage) |
| `node-fetch`   | HTTP requests (external APIs)|
| `axios`        | HTTP requests (external APIs)|

Install dependencies:
```bash
npm install stripe @mollie/api-client express cors dotenv body-parser mongoose node-fetch axios
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v16+
- npm or yarn
- MongoDB connection (for session storage, see [`src/db.js`](src/db.js))
- Stripe & Mollie accounts with API keys

### Installation

```bash
cd backend/
npm install
# or
yarn
```

---

## Environment Variables

Create a `.env` file in `/backend` with:

```
PORT=3000

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx

# Mollie
MOLLIE_API_KEY=test_xxx

# URLs (update for deployment or local tunneling)
FRONTEND_URL=http://localhost:5173
WEBHOOK_URL=https://yourdomain.com # Must be public for webhooks

# Database
MONGODB_URI=your_mongodb_uri
```

- Use [ngrok](https://ngrok.com/) or similar to expose your backend for webhook events during development.
- `FRONTEND_URL` should match your frontend app URL for post-payment redirects.

---

## API Endpoints & Full Route Code

### Stripe Payments Flow

#### 1. Create Stripe Checkout Session

**POST** `/create-payment/stripe`

Request:
```json
{
  "amount": 49.99,
  "description": "Sample Product"
}
```
Response:
```json
{
  "checkoutUrl": "https://checkout.stripe.com/pay/cs_test_..."
}
```

**Full Route Code:**
```js
// Stripe Checkout Payment
app.post("/create-payment/stripe", async (req, res) => {
  const { amount, description } = req.body;
  try {
    const session = await createStripeCheckoutSession(amount, description);
    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Stripe Error:", err);
    res.status(500).json({ error: "Stripe checkout failed" });
  }
});
```
Requires `createStripeCheckoutSession` helper from `src/stripe.js`.

---

#### 2. Retrieve Stripe Session Details

**GET** `/stripe-session/:sessionId`

Request: *(No body, sessionId in URL)*
Response: Stripe checkout/session info object.

**Full Route Code:**
```js
app.get("/stripe-session/:sessionId", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId, {
      expand: ["line_items", "payment_intent"],
    });
    console.log(session);
    res.json(session);
  } catch (err) {
    console.error("Stripe fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch Stripe session" });
  }
});
```

---

### Mollie Payments Flow

#### 1. Create Mollie Payment

**POST** `/create-payment/mollie`

Request:
```json
{
  "amount": 15.00,
  "description": "Ebook Sale"
}
```
Response:
```json
{
  "checkoutUrl": "https://www.mollie.com/payscreen/select-method/...",
  "paymentId": "tr_xxxxx",
  "orderId": "order-..."
}
```

**Full Route Code:**  
Includes orderId generation, validation, and redirects.
```js
app.post("/create-payment/mollie", async (req, res) => {
  const { amount, description } = req.body;

  try {
    // Validate amount
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount provided" });
    }

    // Generate a unique order ID
    const orderId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
    };

    // Only add webhook URL if properly configured
    const webhookUrl = getWebhookUrl();
    if (webhookUrl) {
      paymentData.webhookUrl = webhookUrl;
    }

    const payment = await mollieClient.payments.create(paymentData);

    console.log(`✅ Mollie payment created: ${payment.id}`);

    // Now update with the specific redirect URL containing the payment ID
    try {
      const updatedPayment = await mollieClient.payments.update(payment.id, {
        redirectUrl: getRedirectUrl(payment.id),
      });
      console.log(`✅ Mollie payment redirect URL updated: ${payment.id}`);
    } catch (updateError) {
      console.warn("⚠️  Could not update redirect URL, using original payment:", updateError.message);
      // Continue with original payment if update fails
    }

    const checkoutUrl = payment._links?.checkout?.href;

    if (checkoutUrl) {
      res.json({
        checkoutUrl,
        paymentId: payment.id,
        orderId: orderId,
      });
    } else {
      console.error("❌ No checkout URL returned from Mollie");
      res.status(500).json({ error: "No checkout URL returned" });
    }
  } catch (err) {
    console.error("❌ Mollie Payment Error:", err.message || err);

    // Provide more specific error messages
    let errorMessage = "Mollie payment failed";
    let errorDetails = err.message;

    if (err.field === "redirectUrl") {
      errorMessage = "Invalid redirect URL configuration";
      errorDetails = `The redirect URL is not valid. Make sure FRONTEND_URL is set to a valid URL. Current: ${process.env.FRONTEND_URL || "http://localhost:5173"}`;
    } else if (err.field === "webhookUrl") {
      errorMessage = "Invalid webhook URL configuration";
      errorDetails = `The webhook URL is not valid. Current: ${getWebhookUrl() || "Not set"}`;
    }

    res.status(500).json({
      error: errorMessage,
      details: errorDetails,
      field: err.field || "unknown",
    });
  }
});
```

---

#### 2. Retrieve Mollie Payment Details

**GET** `/mollie-session/:paymentId`

Request: *(No body, paymentId in URL)*
Response: Mollie session data object.

**Full Route Code:**
```js
app.get("/mollie-session/:paymentId", async (req, res) => {
  const { paymentId } = req.params;

  console.log(`🔍 Fetching Mollie payment: ${paymentId}`);

  // Validate payment ID format
  if (!paymentId || paymentId === "{id}" || paymentId.includes("{") || paymentId.includes("}")) {
    console.error(`❌ Invalid payment ID format: ${paymentId}`);
    return res.status(400).json({
      error: "Invalid payment ID format",
      details: `Received payment ID: ${paymentId}`,
    });
  }

  try {
    const payment = await mollieClient.payments.get(paymentId);
    console.log(`✅ Successfully fetched Mollie payment: ${paymentId}`);
    console.log(payment);
    res.json(payment);
  } catch (err) {
    console.error("❌ Mollie fetch error:", err.message);
    console.error("Payment ID that caused error:", paymentId);
    res.status(500).json({
      error: "Failed to fetch Mollie payment session",
      paymentId: paymentId,
      details: err.message,
    });
  }
});
```

---

> For route helper functions like `getRedirectUrl()`, see definitions in your backend code (`index.js`).

---

## Webhooks

Payment result webhooks are handled at:  
**POST `/webhooks/stripe`**  
**POST `/webhooks/mollie`**  

- Setup your payment providers to point to `${WEBHOOK_URL}/webhooks/stripe` and `${WEBHOOK_URL}/webhooks/mollie`.
- Webhooks are processed in [`src/webhook.js`](src/webhook.js), which must validate and persist the event.

**Important:** For production, `WEBHOOK_URL` **must be a public (HTTPS) endpoint**.

---

## Testing & Diagnostics

**Test Mollie Configuration**

`GET /test-mollie-config`

Returns your current Mollie/redirect/webhook settings & helpful development recommendations.

---

## Project Structure

```
backend/
  ├── index.js                  # Main server & API endpoints
  ├── .env                      # Env config (never commit this!)
  ├── package.json
  └── src/
      ├── mollie.js             # Mollie logic
      ├── stripe.js             # Stripe logic
      ├── webhook.js            # Webhook handlers/routes
      ├── db.js                 # DB connection/config
      └── models/
          └── stripePayement.model.js
```

---

## Troubleshooting

- **Webhooks not firing?**
  - Confirm `WEBHOOK_URL` is a public URL (use ngrok for localhost).
  - Check payment provider's dashboard for delivery errors.
  - See backend logs for warnings about misconfigured URLs.

- **Stripe/Mollie errors?**
  - Double-check API keys and secrets in `.env`.
  - Review network/API logs for precise `"field"` and error messages in failed responses.

- **Database issues?**
  - Ensure your `MONGODB_URI` is set and that your DB accepts connections.

**General Debug Tips:**
- Watch backend logs; most errors/flows provide detailed log output.
- Use `/test-mollie-config` before going live to verify integration details.

---

## License

MIT

---

> For issues or feature requests, please open a GitHub issue or contact the maintainer.