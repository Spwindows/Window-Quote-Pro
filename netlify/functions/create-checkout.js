// netlify/functions/create-checkout.js
// Creates a Stripe Checkout Session for Pro Solo or Pro Team plans.
// Environment variables: STRIPE_SECRET_KEY, STRIPE_PRICE_ID_PRO_SOLO,
// STRIPE_PRICE_ID_PRO_TEAM, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PRICE_MAP = {
  pro_solo: process.env.STRIPE_PRICE_ID_PRO_SOLO,
  pro_team: process.env.STRIPE_PRICE_ID_PRO_TEAM
};

const fetch = globalThis.fetch;

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
    throw new Error(`Supabase ${method} ${path} failed: ${res.status} ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { plan, userId, email } = JSON.parse(event.body || '{}');

    if (!plan || !['pro_solo', 'pro_team'].includes(plan)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Invalid plan value: ${plan}` })
      };
    }

    const priceId = PRICE_MAP[plan];
    if (!priceId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: `Missing Stripe price ID for ${plan}.` })
      };
    }

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing userId.' })
      };
    }

    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing email.' })
      };
    }

    const appUrl = (process.env.APP_URL || 'https://windowquotepro.com').replace(/\/+$/, '');

    let stripeCustomerId = null;

    const rows = await supabaseRequest(
      'GET',
      `subscriptions?user_id=eq.${userId}&select=stripe_customer_id`
    );

    if (rows && rows.length > 0 && rows[0].stripe_customer_id) {
      stripeCustomerId = rows[0].stripe_customer_id;
      try {
        await stripe.customers.retrieve(stripeCustomerId);
      } catch (e) {
        stripeCustomerId = null;
      }
    }

    if (!stripeCustomerId) {
      const existing = await stripe.customers.list({ email, limit: 1 });

      if (existing.data.length > 0) {
        stripeCustomerId = existing.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email,
          metadata: { supabase_user_id: userId }
        });
        stripeCustomerId = customer.id;
      }

      await supabaseRequest(
        'POST',
        'subscriptions?on_conflict=user_id',
        {
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          subscription_plan: plan,
          subscription_status: 'trialing',
          updated_at: new Date().toISOString()
        }
      );
    }

    const sessionParams = {
      mode: 'subscription',
      customer: stripeCustomerId,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancel`,
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          supabase_user_id: userId,
          plan
        }
      },
      metadata: {
        supabase_user_id: userId,
        plan
      }
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    console.error('create-checkout error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Internal server error' })
    };
  }
};
