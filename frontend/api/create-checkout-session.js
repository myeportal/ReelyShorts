const PRODUCTS = {
  'white-label': {
    name: process.env.REELY_SHORTS_WHITE_LABEL_NAME || 'REELY SHORTS White Label License',
    description: process.env.REELY_SHORTS_WHITE_LABEL_DESCRIPTION || 'Secure checkout for the REELY SHORTS white label app package.',
    successPath: '/thank-you.html?product=white-label&session_id={CHECKOUT_SESSION_ID}',
    cancelPath: '/?checkout=cancelled&product=white-label',
  },
}

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}

function getProductAmount(productKey) {
  const raw = process.env.REELY_SHORTS_WHITE_LABEL_AMOUNT
  const amount = Number.parseInt(raw || '', 10)

  if (productKey === 'white-label' && Number.isFinite(amount) && amount > 0) {
    return amount
  }

  const error = new Error('Missing REELY_SHORTS_WHITE_LABEL_AMOUNT environment variable')
  error.statusCode = 500
  throw error
}

async function createStripeCheckoutSession({ secretKey, baseUrl, productKey }) {
  const product = PRODUCTS[productKey]
  if (!product) {
    const error = new Error('Unknown product')
    error.statusCode = 400
    throw error
  }

  const amount = getProductAmount(productKey)

  const params = new URLSearchParams({
    mode: 'payment',
    'payment_method_types[0]': 'card',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][price_data][product_data][name]': product.name,
    'line_items[0][price_data][product_data][description]': product.description,
    'line_items[0][quantity]': '1',
    success_url: `${baseUrl}${product.successPath}`,
    cancel_url: `${baseUrl}${product.cancelPath}`,
    'metadata[product_key]': productKey,
  })

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  const payload = await response.json()
  if (!response.ok || !payload.url) {
    const error = new Error(payload?.error?.message || 'Stripe checkout session creation failed')
    error.statusCode = response.status || 500
    throw error
  }

  return payload.url
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY environment variable' })
  }

  try {
    const product = req.query.product || req.body?.product || 'white-label'
    const url = await createStripeCheckoutSession({
      secretKey,
      baseUrl: getBaseUrl(req),
      productKey: product,
    })

    if (req.method === 'GET') {
      return res.redirect(303, url)
    }

    return res.status(200).json({ url })
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Checkout session error' })
  }
}
