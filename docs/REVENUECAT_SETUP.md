# Setting up Chapter Plus in RevenueCat

Chapter Plus is an optional monthly subscription sold with **RevenueCat Web Billing**. Everything else in Chapter stays free; Plus triples the monthly AI allowances. No Apple or Google developer account is needed, and for testing you don't need your own Stripe account: RevenueCat can create a sandbox for you.

The database (migration 020) and the two Edge Functions (`revenuecat-webhook`, `revenuecat-sync`) are already deployed. Only these dashboard steps remain.

## 1. Account and project

1. Sign up at https://app.revenuecat.com (free).
2. Create a project called **Chapter**.

## 2. Web Billing app

1. In the project, add an app of type **Web** and choose **RevenueCat Billing** (Web Billing).
2. When asked for a payment gateway, choose to **create a sandbox** (a claimable Stripe sandbox). You can connect a real Stripe account later for live payments.

## 3. Product, entitlement and offering

1. **Product catalog → Products → New**: store *RevenueCat Billing*, identifier `chapter_plus_monthly`, type *subscription*, duration *1 month*, a price such as $3.99, display name **Chapter Plus**.
2. **Entitlements → New**: identifier **`plus`** (exactly this), then attach `chapter_plus_monthly`.
3. **Offerings**: open the **default** offering (create it if missing), add a **Monthly** package containing `chapter_plus_monthly`, and make sure the offering is marked **current**.

## 4. API keys

1. **API keys**: copy the **Web Billing public API key** for sandbox. It's public (it ships in the web app), so you can send it in chat.
2. **API keys → + New secret API key**: name it `chapter-server`, choose **API version 1**, and copy it. This one is secret. Paste it after `REVENUECAT_SECRET_KEY=` in `supabase/functions/.env` and save. Don't share it.

## 5. Webhook

**Integrations → Webhooks → Add**:

- **URL**: `https://vecswdpfsmvehesyhalr.supabase.co/functions/v1/revenuecat-webhook`
- **Authorization header value**: `Bearer ` followed by the `REVENUECAT_WEBHOOK_AUTH` value from `supabase/functions/.env`
- **Environment**: both sandbox and production
- Save, then use **Send test event**. It should return 200.

## Test Store keys

A public key starting with `test_` is a **Test Store** key: RevenueCat simulates the checkout (buttons *Test valid purchase*, *Test failed purchase*, *Cancel*) and nothing is charged. Chapter's Plus card explains this automatically. The products and the **current** offering must be set up for the Test Store app, or `getOfferings()` returns nothing and the card says Plus is not available. A key starting with `rcb_sb_` is a Web Billing sandbox key (Stripe test cards); `rcb_` without `sb` takes real payments.

## How it works

1. The web app configures RevenueCat with the student's Supabase user id, so a purchase belongs to that account.
2. **Get Plus** opens RevenueCat's checkout. In sandbox, use card `4242 4242 4242 4242`, any future date and any CVC.
3. After checkout the app calls `revenuecat-sync`, which asks RevenueCat's REST API (with the secret key) what the user is entitled to and records it in `entitlements`. The webhook records renewals, cancellations and expirations as they happen.
4. The database triples the AI allowance while the entitlement is active. The client can't grant itself Plus: only these two server functions write RevenueCat entitlements.

Cancelling keeps Plus until the paid period ends. Expiration removes it. Late or repeated webhook events are ignored.
