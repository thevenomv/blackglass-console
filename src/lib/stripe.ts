import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // Pin to the API version shipped with this package.
  // Update here when you deliberately upgrade stripe.
  apiVersion: "2026-04-22.dahlia",
});
