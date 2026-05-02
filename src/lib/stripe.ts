import Stripe from "stripe";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(key, {
    // Pin to the API version shipped with this package.
    // Update here when you deliberately upgrade stripe.
    apiVersion: "2026-04-22.dahlia",
  });
}

// Lazy singleton — instantiated on first use, never at build time.
let _stripe: Stripe | undefined;
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    if (!_stripe) _stripe = getStripe();
    return (_stripe as unknown as Record<string | symbol, unknown>)[prop];
  },
});
