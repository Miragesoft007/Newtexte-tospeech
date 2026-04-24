const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { requireAuth } = require("../middleware/auth");

const PLANS = {
  starter: {
    priceId: process.env.STRIPE_PRICE_STARTER,
    limit: 100000,
    name: "Starter",
  },
  pro: {
    priceId: process.env.STRIPE_PRICE_PRO,
    limit: -1,
    name: "Pro",
  },
};

// Create Stripe checkout session
router.post("/checkout", requireAuth, async (req, res) => {
  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: "Plan invalide." });

  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  const user = req.user;

  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email });
    customerId = customer.id;
    db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?")
      .run(customerId, user.id);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: PLANS[plan].priceId, quantity: 1 }],
    success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/pricing`,
    metadata: { userId: user.id, plan },
  });

  res.json({ url: session.url });
});

// Customer portal (manage subscription)
router.post("/portal", requireAuth, async (req, res) => {
  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  const user = req.user;

  if (!user.stripe_customer_id)
    return res.status(400).json({ error: "Aucun abonnement actif." });

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${process.env.FRONTEND_URL}/dashboard`,
  });

  res.json({ url: session.url });
});

// Stripe webhook — update plan after payment
router.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { userId, plan } = session.metadata;
    const planData = PLANS[plan];
    if (planData) {
      db.prepare(
        "UPDATE users SET plan = ?, chars_limit = ?, stripe_subscription_id = ? WHERE id = ?"
      ).run(plan, planData.limit, session.subscription, userId);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    db.prepare(
      "UPDATE users SET plan = 'free', chars_limit = 3000, stripe_subscription_id = NULL WHERE stripe_subscription_id = ?"
    ).run(sub.id);
  }

  res.json({ received: true });
});

module.exports = router;
