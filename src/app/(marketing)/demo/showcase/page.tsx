/**
 * /demo/showcase — retired endpoint.
 *
 * Originally a chrome-free live polling view of the public auto-provisioning
 * showcase Droplet. The auto-provisioner was retired on 2026-05-07 (see
 * docs/runbooks/operations.md §5) because it cost a permanent Droplet quota
 * slot, ongoing ops complexity (cloud-init, SSH handshake debugging, BullMQ
 * plumbing, DO App-Platform → Droplet network paths we couldn't fix) for
 * marginal commercial value.
 *
 * The eight drift scenarios it cycled through are now documented as a static
 * walkthrough at /demo/sandbox. We permanently redirect any inbound link
 * (sales decks, outreach emails, old blog posts) to that page.
 */

import { redirect, permanentRedirect } from "next/navigation";

export const dynamic = "force-static";

export default function ShowcaseRetiredPage(): never {
  // permanentRedirect emits a 308 so search engines and embedded links
  // update their indexes; falls back to redirect() if not available.
  if (typeof permanentRedirect === "function") {
    permanentRedirect("/demo/sandbox");
  }
  redirect("/demo/sandbox");
}
