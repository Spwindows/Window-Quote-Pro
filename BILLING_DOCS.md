# Window Quote Pro — Billing Integration Documentation

## Architecture Overview

The billing integration implements a secure, server-validated subscription system using:
- **Stripe**: Handles checkout sessions, billing portal, payment processing, and subscription lifecycle.
- **Netlify Functions**: Provides secure serverless endpoints (`create-checkout`, `billing-portal`, `stripe-webhook`) that interact with Stripe and Supabase using secret keys.
- **Supabase**: Acts as the single source of truth for user subscription state via a dedicated `subscriptions` table.
- **Frontend**: The web app queries Supabase on boot and post-checkout to enforce premium feature gating (`hasProAccess`, `hasTeamAccess`).

## Environment Variables

The following environment variables must be configured in your Netlify dashboard:

| Variable | Description | Example |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret API key (test or live) | `sk_test_51...` |
| `STRIPE_WEBHOOK_SECRET` | Secret used to verify webhook signatures | `whsec_...` |
| `STRIPE_PRICE_ID_PRO_SOLO` | Price ID for the Pro Solo plan | `price_1TMmVwAi5DEpTmRsbKtrEEz0` |
| `STRIPE_PRICE_ID_PRO_TEAM` | Price ID for the Pro Team plan | `price_1TMmYOAi5DEpTmRsmRyYt8UO` |
| `SUPABASE_URL` | Your Supabase project URL | `https://xyz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS) | `eyJhbGci...` |
| `APP_URL` | The production URL of your app | `https://windowquotepro.com` |

## Stripe Dashboard Setup Steps

1. **Create Products and Prices**:
   - Create a "Pro Solo" product with a recurring price of $19.99/month.
   - Create a "Pro Team" product with a recurring price of $39.99/month.
   - Ensure the correct test mode Price IDs are set in your environment variables.
2. **Configure Customer Portal**:
   - Go to Settings > Billing > Customer portal.
   - Enable the portal and allow customers to cancel or update their subscriptions.
   - Set the terms of service and privacy policy links.
3. **Configure Webhooks**:
   - Go to Developers > Webhooks.
   - Add an endpoint pointing to `https://your-domain.com/.netlify/functions/stripe-webhook`.
   - Select the following events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`
   - Reveal the webhook secret and add it to `STRIPE_WEBHOOK_SECRET` in Netlify.

## Supabase Setup Steps

1. Go to the Supabase Dashboard > SQL Editor.
2. Create a new query and paste the contents of `supabase-migration.sql`.
3. Run the query to create the `subscriptions` table, enable Row Level Security (RLS), and set up the necessary indexes and triggers.

## Netlify Deploy Steps

1. Ensure the `netlify.toml` file is in the root of your repository.
2. Ensure the `netlify/functions/` directory contains the three serverless functions.
3. Connect your repository to Netlify.
4. Go to Site settings > Environment variables and add all required variables listed above.
5. Trigger a deployment. Netlify will automatically build and deploy the frontend and the serverless functions.

## What is Production-Ready Now

- **Checkout Flow**: Users can securely initiate a checkout session for Pro Solo or Pro Team plans, with a 7-day free trial.
- **Webhook Processing**: The webhook handler is robust, idempotent, and updates Supabase reliably based on Stripe events.
- **State Management**: The frontend accurately fetches and enforces subscription state from Supabase, handling active, trialing, past due, and canceled states correctly.
- **Billing Portal**: Paid users can securely access the Stripe Billing Portal to manage their subscriptions.
- **Feature Gating**: Premium features (invoicing, custom branding, team access) are strictly gated based on server-validated subscription data.

## What is Web-Launch-Only

- **Checkout Method**: The current implementation uses Stripe Checkout, which redirects the user to a Stripe-hosted page. This is ideal for web but not permitted for digital goods in native app stores.
- **Additional Team Seats**: The schema supports storing `team_seat_count`, but the UI and backend logic for dynamic quantity-based billing (+$9.99/month per extra member) is deferred. For now, Pro Team includes up to 3 members by policy, but dynamic billing is not enforced at checkout.

## Future Native App Store Billing Considerations

To launch on the iOS App Store or Google Play Store, the billing architecture will need to evolve:

1. **In-App Purchases (IAP)**: You cannot use Stripe Checkout for digital subscriptions in native apps. You must use Apple's StoreKit and Google Play Billing.
2. **RevenueCat Integration**: It is highly recommended to integrate a service like RevenueCat to unify Stripe (web), Apple, and Google subscriptions into a single source of truth.
3. **Backend Updates**: The Netlify webhook handler would need to process webhooks from RevenueCat instead of (or in addition to) Stripe.
4. **Frontend Updates**: The `startCheckout` function would need conditional logic: use Stripe on the web, but invoke native IAP SDKs when running inside the mobile app wrapper.

## Deferred Items

- **Dynamic Seat Billing**: Implementing the +$9.99/month per additional team member logic requires quantity-based billing in Stripe and UI to manage seat counts. The database schema (`team_seat_count`) is ready for this future enhancement.
- **Proration Handling**: If users upgrade from Pro Solo to Pro Team mid-cycle, Stripe handles proration automatically, but the UI could be enhanced to explain this clearly before checkout.
