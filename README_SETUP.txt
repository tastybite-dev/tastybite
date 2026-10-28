TASTYBITE AUTOMATION STARTER — IMPORTANT SETUP REQUIRED

WHAT THIS STARTER DOES
- Adds a server API to store submitted orders in SQLite.
- Calculates totals on the server from a fixed menu list (do not trust browser totals).
- Attempts to send an order alert through the official WhatsApp Business Platform when API credentials and an approved template are configured.
- Keeps payment status as PENDING until a trusted verification process is configured.
- Includes an admin-only manual mark-paid endpoint, protected by ADMIN_API_KEY, for use only after independently checking PalmPay.

WHAT IT DOES NOT DO YET
- It is not deployed or live.
- The checkout form is wired to POST cart item IDs/quantities and customer details to /api/orders. It requires the Node server to be running; opening index.html directly as a file will not work for API submissions.
- It does not automatically verify incoming transfers to the existing PalmPay account number.
- It does not automatically message customers with order confirmation.
- WhatsApp notification requires Meta business setup, an API phone number ID, an access token, and a pre-approved message template. Do not assume your normal WhatsApp number can be used unchanged; follow Meta's onboarding flow.
- PalmPay developer docs show collection/verification APIs, but eligibility and webhook support for your exact account and the existing static transfer account have not been confirmed. Contact PalmPay Business and request API access for incoming transfer notifications/webhooks and transaction verification.

REQUIRED NEXT STEPS
1. On a computer, install Node.js 20+ from https://nodejs.org/ and open a terminal in this folder.
2. Run: npm install
3. Copy .env.example to .env and fill it only on the server/hosting environment, never in frontend files or public repos.
4. Create/verify a Meta Business Portfolio and WhatsApp Business Account at https://business.facebook.com/ and follow the WhatsApp Cloud API setup at https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/.
5. Create and get approval for a WhatsApp utility template named tastybite_new_order with four body variables: order ID, customer name, total, payment status. Set the API phone number ID and token in .env.
6. The included index.html already posts checkout data to /api/orders. Run the app through the Node server, not by double-clicking index.html.
7. Deploy to a Node-capable HTTPS host with persistent storage, environment variables, and access controls. Static-only hosting alone cannot run this server.
8. Contact PalmPay Business through official channels: https://www.palmpay.com/business/payin/ and https://docs.palmpay.com/ . Ask if your account can receive server-side notifications/webhooks for incoming transfers to your existing account number, and obtain official signature verification and transaction-query documentation. Never put PalmPay secret credentials in browser code.
9. Until the official PalmPay integration is configured and tested, check incoming transfers manually. Do not mark an order paid based only on a screenshot or customer-supplied reference.

AGE / ACCOUNT NOTE
Merchant, Meta business, and payment account eligibility may require an adult/guardian and identity/business verification. Do not bypass age or verification requirements.

SECURITY
- Never send .env, access tokens, API keys, passwords, OTPs, or PalmPay login credentials to anyone.
- Use HTTPS, keep dependencies updated, limit admin access, and test with fake/test data before accepting real orders.
