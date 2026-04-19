// netlify/functions/stripe-webhook.js
// Handles Stripe webhook events and updates Supabase subscriptions table.
// Environment variables: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const fetch = globalThis.fetch || require('node-fetch');

/* ------------------------------------------------------------------ */
/* Supabase REST helper                                                */
/* ------------------------------------------------------------------ */
async function supabaseRequest(method, path, body) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${path}: ${res.status} ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ------------------------------------------------------------------ */
/* Map Stripe price ID to plan name                                    */
/* ------------------------------------------------------------------ */
function planFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_PRICE_ID_PRO_SOLO) return 'pro_solo';
  if (priceId === process.env.STRIPE_PRICE_ID_PRO_TEAM) return 'pro_team';
  return 'unknown';
}

/* ------------------------------------------------------------------ */
/* Resolve Supabase user_id from Stripe metadata or customer lookup    */
/* ------------------------------------------------------------------ */
function getUserIdFromMetadata(obj) {
  if (!obj) return null;
  // Check subscription_data.metadata, session metadata, subscription metadata
  if (obj.metadata && obj.metadata.supabase_user_id) return obj.metadata.supabase_user_id;
  if (obj.client_reference_id) return obj.client_reference_id;
  return null;
}

async function getUserIdFromCustomer(stripeCustomerId) {
  if (!stripeCustomerId) return null;
  const rows = await supabaseRequest(
    'GET',
    `subscriptions?stripe_customer_id=eq.${stripeCustomerId}&select=user_id`
  );
  if (rows && rows.length > 0) return rows[0].user_id;
  return null;
}

/* ------------------------------------------------------------------ */
/* Upsert subscription row — idempotent by user_id                     */
/* ------------------------------------------------------------------ */
async function upsertSubscription(userId, patch) {
  if (!userId) {
    console.warn('upsertSubscription: no userId, skipping');
    return;
  }
  patch.user_id = userId;
  patch.updated_at = new Date().toISOString();

  await supabaseRequest(
    'POST',
    'subscriptions?on_conflict=user_id',
    patch
  );
}

/* ------------------------------------------------------------------ */
/* Event handlers                                                      */
/* ------------------------------------------------------------------ */

async function handleCheckoutCompleted(session) {
  const userId = getUserIdFromMetadata(session);
  if (!userId) {
    console.warn('checkout.session.completed: no userId found');
    return;
  }

  const customerId = session.customer;
  const subscriptionId = session.subscription;
  const plan = (session.metadata && session.metadata.plan) || 'unknown';

  // Fetch the subscription from Stripe for accurate status
  let subStatus = 'active';
  let currentPeriodEnd = null;
  let trialEnd = null;

  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      subStatus = sub.status; // 'trialing', 'active', etc.
      currentPeriodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;
      trialEnd = sub.trial_end
        ? new Date(sub.trial_end * 1000).toISOString()
        : null;
    } catch (e) {
      console.warn('Could not fetch subscription:', e.message);
    }
  }

  await upsertSubscription(userId, {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    subscription_plan: plan,
    subscription_status: subStatus,
    current_period_end: currentPeriodEnd,
    trial_end: trialEnd,
    cancel_at_period_end: false
  });
}

async function handleSubscriptionCreatedOrUpdated(subscription) {
  const userId =
    getUserIdFromMetadata(subscription) ||
    (await getUserIdFromCustomer(subscription.customer));

  if (!userId) {
    console.warn('subscription event: no userId found for customer', subscription.customer);
    return;
  }

  // Determine plan from the first line item price
  let plan = 'unknown';
  if (subscription.items && subscription.items.data && subscription.items.data.length > 0) {
    const priceId = subscription.items.data[0].price.id;
    plan = planFromPriceId(priceId);
  }

  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;

  await upsertSubscription(userId, {
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    subscription_plan: plan,
    subscription_status: subscription.status,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: !!subscription.cancel_at_period_end,
    trial_end: trialEnd
  });
}

async function handleSubscriptionDeleted(subscription) {
  const userId =
    getUserIdFromMetadata(subscription) ||
    (await getUserIdFromCustomer(subscription.customer));

  if (!userId) {
    console.warn('subscription.deleted: no userId found');
    return;
  }

  await upsertSubscription(userId, {
    stripe_subscription_id: subscription.id,
    subscription_plan: 'free',
    subscription_status: 'canceled',
    cancel_at_period_end: false,
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null
  });
}

async function handleInvoicePaid(invoice) {
  if (!invoice.subscription) return;

  const userId = await getUserIdFromCustomer(invoice.customer);
  if (!userId) return;

  // Refresh subscription state from Stripe for accuracy
  try {
    const sub = await stripe.subscriptions.retrieve(invoice.subscription);
    await handleSubscriptionCreatedOrUpdated(sub);
  } catch (e) {
    console.warn('invoice.paid: could not refresh subscription:', e.message);
  }
}

async function handleInvoicePaymentFailed(invoice) {
  if (!invoice.subscription) return;

  const userId = await getUserIdFromCustomer(invoice.customer);
  if (!userId) return;

  // Refresh subscription state — Stripe will have set status to past_due
  try {
    const sub = await stripe.subscriptions.retrieve(invoice.subscription);
    await handleSubscriptionCreatedOrUpdated(sub);
  } catch (e) {
    console.warn('invoice.payment_failed: could not refresh subscription:', e.message);
  }
}

/* ------------------------------------------------------------------ */
/* Main handler                                                        */
/* ------------------------------------------------------------------ */
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  /* Verify webhook signature */
  let stripeEvent;
  try {
    const sig = event.headers['stripe-signature'];
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  console.log(`Stripe webhook received: ${stripeEvent.type} [${stripeEvent.id}]`);

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripeEvent.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionCreatedOrUpdated(stripeEvent.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(stripeEvent.data.object);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(stripeEvent.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(stripeEvent.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }
  } catch (err) {
    console.error(`Error processing ${stripeEvent.type}:`, err);
    // Return 200 to prevent Stripe from retrying on application errors
    // that would produce the same result. Log for investigation.
    return { statusCode: 200, body: JSON.stringify({ received: true, error: err.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
