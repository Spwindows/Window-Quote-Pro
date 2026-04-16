// netlify/functions/create-checkout.js
// Creates a Stripe Checkout Session for Pro Solo or Pro Team plans.
// Environment variables: STRIPE_SECRET_KEY, STRIPE_PRICE_ID_PRO_SOLO,
//   STRIPE_PRICE_ID_PRO_TEAM, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRICE_MAP = {
  pro_solo: process.env.STRIPE_PRICE_ID_PRO_SOLO,
  pro_team: process.env.STRIPE_PRICE_ID_PRO_TEAM
};

/* ------------------------------------------------------------------ */
/* CORS helper                                                         */
/* ------------------------------------------------------------------ */
function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

/* ------------------------------------------------------------------ */
/* Minimal Supabase REST helper — uses Node 18 native fetch            */
/* ------------------------------------------------------------------ */
async function supabaseRequest(method, path, body) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: method === 'POST' ? 'return=representation' : 'return=representation'
  };
  if (method === 'PATCH') {
    headers.Prefer = 'return=representation';
  }
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

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */
exports.handler = async (event) => {
  /* Handle CORS preflight */
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { plan, userId, email } = JSON.parse(event.body || '{}');

    /* Validate inputs */
    if (!plan || !PRICE_MAP[plan]) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Invalid plan. Must be pro_solo or pro_team.' })
      };
    }
    if (!userId) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing userId.' }) };
    }
    if (!email) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing email.' }) };
    }

    const priceId = PRICE_MAP[plan];
    const appUrl = (process.env.APP_URL || 'https://windowquotepro.netlify.app').replace(/\/+$/, '');

    /* ---- Find or create Stripe customer ---- */
    let stripeCustomerId = null;

    // Check Supabase for existing stripe_customer_id
    const rows = await supabaseRequest(
      'GET',
      `subscriptions?user_id=eq.${userId}&select=stripe_customer_id`
    );
    if (rows && rows.length > 0 && rows[0].stripe_customer_id) {
      stripeCustomerId = rows[0].stripe_customer_id;
      // Verify customer still exists in Stripe
      try {
        await stripe.customers.retrieve(stripeCustomerId);
      } catch (e) {
        // Customer deleted in Stripe — create a new one
        stripeCustomerId = null;
      }
    }

    if (!stripeCustomerId) {
      // Search Stripe by email to avoid duplicates
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
      // Upsert stripe_customer_id in Supabase subscriptions table
      await supabaseRequest(
        'POST',
        'subscriptions?on_conflict=user_id',
        {
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          subscription_plan: 'free',
          subscription_status: 'free',
          updated_at: new Date().toISOString()
        }
      );
    }

    /* ---- Create Checkout Session ---- */
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
          plan: plan
        }
      },
      metadata: {
        supabase_user_id: userId,
        plan: plan
      }
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    console.error('create-checkout error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message || 'Internal server error' })
    };
  }
};
