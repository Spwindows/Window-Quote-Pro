// netlify/functions/stripe-webhook.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/* ---------------- SUPABASE ---------------- */

async function supabaseRequest(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function upsertSubscription(userId, data) {
  return supabaseRequest('POST', 'subscriptions?on_conflict=user_id', {
    user_id: userId,
    ...data,
    updated_at: new Date().toISOString()
  });
}

/* ---------------- NORMALIZATION ---------------- */

function normalizePlan(p) {
  p = String(p || '').toLowerCase();
  return p === 'pro_solo' || p === 'pro_team' ? p : 'free';
}

function normalizeStatus(s) {
  s = String(s || '').toLowerCase();
  if (s === 'trialing') return 'trial';
  if (s === 'canceled') return 'cancelled';
  if (['active', 'trial', 'cancelled', 'expired'].includes(s)) return s;
  return 'free';
}

function planFromPriceId(id) {
  if (id === process.env.STRIPE_PRICE_ID_PRO_SOLO) return 'pro_solo';
  if (id === process.env.STRIPE_PRICE_ID_PRO_TEAM) return 'pro_team';
  return 'free';
}

/* ---------------- HELPERS ---------------- */

function getUserIdFromMetadata(obj) {
  return obj?.metadata?.supabase_user_id || obj?.client_reference_id || null;
}

async function getUserIdFromCustomer(customer) {
  const rows = await supabaseRequest(
    'GET',
    `subscriptions?stripe_customer_id=eq.${customer}&select=user_id`
  );
  return rows?.[0]?.user_id || null;
}

/* ---------------- HANDLERS ---------------- */

async function handleCheckoutCompleted(session) {
  const userId = getUserIdFromMetadata(session);
  if (!userId) return;

  let plan = normalizePlan(session.metadata?.plan);
  const subscriptionId = session.subscription;

  let subStatus = 'free';
  let currentPeriodEnd = null;
  let trialEnd = null;

  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);

      const priceId = sub.items?.data?.[0]?.price?.id;
      if (plan === 'free') plan = planFromPriceId(priceId);

      subStatus = sub.status;

      currentPeriodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;

      trialEnd = sub.trial_end
        ? new Date(sub.trial_end * 1000).toISOString()
        : null;

    } catch {
      subStatus = 'active'; // safe fallback
    }
  }

  await upsertSubscription(userId, {
    stripe_customer_id: session.customer,
    stripe_subscription_id: subscriptionId,
    plan: normalizePlan(plan),
    status: normalizeStatus(subStatus),
    current_period_end: currentPeriodEnd,
    trial_end: trialEnd,
    cancel_at_period_end: false
  });
}

async function handleSubscriptionUpdated(sub) {
  const userId =
    getUserIdFromMetadata(sub) ||
    await getUserIdFromCustomer(sub.customer);

  if (!userId) return;

  const priceId = sub.items?.data?.[0]?.price?.id;
  const plan = planFromPriceId(priceId);

  await upsertSubscription(userId, {
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    plan: normalizePlan(plan),
    status: normalizeStatus(sub.status),
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    trial_end: sub.trial_end
      ? new Date(sub.trial_end * 1000).toISOString()
      : null,
    cancel_at_period_end: !!sub.cancel_at_period_end
  });
}

async function handleSubscriptionDeleted(sub) {
  const userId =
    getUserIdFromMetadata(sub) ||
    await getUserIdFromCustomer(sub.customer);

  if (!userId) return;

  const priceId = sub.items?.data?.[0]?.price?.id;

  await upsertSubscription(userId, {
    stripe_subscription_id: sub.id,
    plan: normalizePlan(planFromPriceId(priceId)),
    status: 'cancelled',
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null
  });
}

/* ---------------- MAIN ---------------- */

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      event.headers['stripe-signature'],
      WEBHOOK_SECRET
    );
  } catch (err) {
    return { statusCode: 400, body: err.message };
  }

  try {
    const obj = stripeEvent.data.object;

    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(obj);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(obj);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(obj);
        break;
    }

  } catch (e) {
    console.error(e);
  }

  return { statusCode: 200 };
};
