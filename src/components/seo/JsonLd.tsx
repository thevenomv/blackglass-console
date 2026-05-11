/**
 * Renders a `<script type="application/ld+json">` block from a plain JS
 * object. Standardises serialisation (single-pass JSON.stringify, no
 * indentation to keep the rendered HTML compact) and applies React's
 * required `dangerouslySetInnerHTML` + `suppressHydrationWarning`
 * boilerplate in one place.
 *
 * Usage:
 *   <JsonLd data={faqPageSchema(FAQ)} id="faq" />
 *
 * The optional `id` becomes the `<script>` element id, useful for tools
 * like Google's Rich Results test that grep the page for a known label.
 */
export function JsonLd({ data, id }: { data: Record<string, unknown>; id?: string }) {
  return (
    <script
      type="application/ld+json"
      id={id}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
