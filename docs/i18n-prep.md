# Internationalization prep

The console and marketing surfaces are **English-first**. To add locales without a big-bang rewrite:

1. **Extract** user-visible strings from `src/components/marketing/*`, trial banners, and error `code` → human copy maps (keep a single `en` bundle first).
2. **Prefer server components** for static marketing; use `accept-language` or path prefix (`/en`, `/de`) when you adopt a router library.
3. **Do not translate** security-sensitive server messages verbatim in client-only JSON — keep canonical `code` enums and map to copy server-side or in a typed dictionary.
4. **Stripe / Clerk** handle localized checkout and emails via their dashboards; align copy there with console terminology.

Recommended libraries when you graduate from a flat dictionary: `next-intl` or Paraglide — evaluate bundle size and RSC compatibility on Next 16+.
