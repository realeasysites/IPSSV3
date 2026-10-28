// Minimal Stripe Checkout client (no SDK). If STRIPE_SECRET_KEY is not set, the store runs in demo mode.
const API = 'https://api.stripe.com/v1';

const enabled = () => /^sk_(test|live)_/.test(process.env.STRIPE_SECRET_KEY || '');

async function call(method, path, params) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json.error && json.error.message) || 'Stripe error');
  return json;
}

function createSession({ order, siteUrl }) {
  return call('POST', '/checkout/sessions', {
    mode: 'payment',
    success_url: `${siteUrl}/o/${order.token}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/o/${order.token}?canceled=1`,
    customer_email: order.email,
    client_reference_id: order.token,
    'metadata[order_id]': String(order.id),
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(order.total_cents),
    'line_items[0][price_data][product_data][name]': `Imagepro order IP-${1000 + order.id}: ${order.title}`.slice(0, 250),
  });
}

function getSession(id) {
  return call('GET', '/checkout/sessions/' + encodeURIComponent(id));
}

module.exports = { enabled, createSession, getSession };
