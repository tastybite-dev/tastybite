// TastyBite automation starter
// Node.js 20+ recommended. Never put secrets in index.html or commit .env.
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Database from "better-sqlite3";
import crypto from "node:crypto";
import "dotenv/config";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const db = new Database(process.env.DB_FILE || "tastybite.db");
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  customer_note TEXT,
  items_json TEXT NOT NULL,
  total_ngn INTEGER NOT NULL,
  payment_reference TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  order_status TEXT NOT NULL DEFAULT 'new',
  whatsapp_status TEXT NOT NULL DEFAULT 'not_sent'
);
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);
`);
const FRONTEND_ORIGIN = "https://tastebite-dev.github.io";

app.use((req, res, next) => {
  if (req.headers.origin === FRONTEND_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static("."));
app.use(express.json({ limit: "40kb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 50 }));

const expectedMenu = {
  1: { name: "Jollof Rice + Chicken", price: 3500 },
  2: { name: "Fried Rice + Chicken", price: 3500 },
  3: { name: "White Rice + Stew", price: 3000 },
  4: { name: "Pounded Yam + Egusi", price: 3000 },
  5: { name: "Beans + Plantain", price: 2500 },
  6: { name: "Meat Pie", price: 800 },
  7: { name: "Chin Chin", price: 500 },
  8: { name: "Chilled Zobo", price: 700 }
};

const money = n => `NGN ${Number(n).toLocaleString("en-NG")}`;
function makeOrderMessage(order) {
  const lines = [
    "🍽️ NEW TASTYBITE ORDER",
    `Order: ${order.id}`,
    `Customer: ${order.customer_name}`,
    `Phone: ${order.customer_phone}`,
    `Delivery: ${order.delivery_address}`,
    order.customer_note ? `Note: ${order.customer_note}` : "",
    "",
    "Items:",
    ...JSON.parse(order.items_json).map(i => `- ${i.name} x ${i.quantity} — ${money(i.lineTotal)}`),
    `TOTAL: ${money(order.total_ngn)}`,
    `Payment status: ${order.payment_status.toUpperCase()}`,
    order.payment_reference ? `Payment reference supplied: ${order.payment_reference}` : "",
    "",
    "Check PalmPay independently. Do not treat a supplied reference or screenshot as proof of payment."
  ];
  return lines.filter(Boolean).join("\n");
}

async function sendWhatsAppAlert(order) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const recipient = process.env.OWNER_WHATSAPP_TO; // international format digits, e.g. 234...
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en";

  if (!token || !phoneNumberId || !recipient || !templateName) {
    db.prepare("UPDATE orders SET whatsapp_status='needs_setup' WHERE id=?").run(order.id);
    return { sent: false, reason: "WhatsApp Cloud API credentials/template not configured" };
  }

  // Use a pre-approved utility template. Create a template with these 4 text parameters:
  // order ID, customer name, total NGN, payment status.
  const body = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: String(order.id) },
          { type: "text", text: String(order.customer_name).slice(0, 80) },
          { type: "text", text: money(order.total_ngn) },
          { type: "text", text: String(order.payment_status).toUpperCase() }
        ]
      }]
    }
  };
  const resp = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const detail = await resp.text();
    console.error("WhatsApp API error:", resp.status, detail);
    db.prepare("UPDATE orders SET whatsapp_status='failed' WHERE id=?").run(order.id);
    return { sent: false, reason: "WhatsApp API request failed" };
  }
  db.prepare("UPDATE orders SET whatsapp_status='sent' WHERE id=?").run(order.id);
  return { sent: true };
}

app.post("/api/orders", async (req, res) => {
  try {
    const { customerName, customerPhone, deliveryAddress, note = "", items, paymentReference = "" } = req.body || {};
    if (![customerName, customerPhone, deliveryAddress].every(v => typeof v === "string" && v.trim())) {
      return res.status(400).json({ error: "Name, phone and delivery address are required." });
    }
    if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
      return res.status(400).json({ error: "Please provide 1–20 cart items." });
    }
    let total = 0;
    const cleanItems = [];
    for (const item of items) {
      const menuItem = expectedMenu[Number(item.id)];
      const quantity = Number(item.quantity);
      if (!menuItem || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
        return res.status(400).json({ error: "Invalid item or quantity." });
      }
      const lineTotal = menuItem.price * quantity;
      total += lineTotal;
      cleanItems.push({ id: Number(item.id), name: menuItem.name, quantity, unitPrice: menuItem.price, lineTotal });
    }
    const id = "TB" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const createdAt = new Date().toISOString();
    db.prepare(`INSERT INTO orders
      (id, created_at, customer_name, customer_phone, delivery_address, customer_note, items_json, total_ngn, payment_reference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, createdAt, customerName.trim().slice(0,100), customerPhone.trim().slice(0,30),
        deliveryAddress.trim().slice(0,500), String(note).slice(0,500), JSON.stringify(cleanItems),
        total, String(paymentReference).slice(0,150));

    const order = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
    const alert = await sendWhatsAppAlert(order);
    return res.status(201).json({
      orderId: id,
      totalNgn: total,
      paymentStatus: "pending",
      orderStatus: "received_pending_payment_verification",
      whatsappNotification: alert.sent ? "sent" : "not_configured_or_failed",
      message: "Order received. Payment is not verified. The store must independently confirm the transfer."
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not save the order." });
  }
});

// Admin status endpoint: requires a long random ADMIN_API_KEY. Use only after manually checking PalmPay.
app.post("/api/admin/orders/:id/mark-paid", (req, res) => {
  const key = req.header("x-admin-key");
  if (!process.env.ADMIN_API_KEY || !key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  db.prepare("UPDATE orders SET payment_status='verified', order_status='confirmed' WHERE id=?").run(order.id);
  res.json({ ok: true, orderId: order.id, paymentStatus: "verified", note: "Only call after checking the transaction in PalmPay." });
});

// PalmPay webhook integration is intentionally NOT marked active.
// Add it only after PalmPay confirms merchant API access, webhook URL requirements,
// signature verification, event fields and whether this account/transfer product is eligible.
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "TastyBite", paymentVerification: "manual_until_official_PalmPay_webhook_is_configured" }));

app.listen(PORT, () => console.log(`TastyBite server listening on port ${PORT}`));
