// netlify/functions/billing-portal.js
// Creates a Stripe Billing Portal session for the authenticated user.
// Environment variables: STRIPE_SECRET_KEY, SUPABASE_URL,
//   SUPABASE_SERVICE_ROLE_KEY, APP_URL

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const fetch = globalThis.fetch || require('node-fetch');

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
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { userId } = JSON.parse(event.body || '{}');

    if (!userId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing userId.' }) };
    }

    /* Look up stripe_customer_id from Supabase */
    const rows = await supabaseRequest(
      'GET',
      `subscriptions?user_id=eq.${userId}&select=stripe_customer_id`
    );

    if (!rows || rows.length === 0 || !rows[0].stripe_customer_id) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No billing account found. Please subscribe first.' })
      };
    }

    const stripeCustomerId = rows[0].stripe_customer_id;
    const appUrl = (process.env.APP_URL || 'https://windowquotepro.com').replace(/\/+$/, '');

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl}/`
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: portalSession.url })
    };
  } catch (err) {
    console.error('billing-portal error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Internal server error' })
    };
  }
};
