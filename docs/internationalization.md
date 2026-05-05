# Internationalization (future)

- All user-facing strings today are **English (en-GB)** in source.
- Before adding locales: freeze a **message catalog** convention (e.g. `next-intl`, `react-i18next`, or CMS-backed copy).
- Theme and i18n are orthogonal: `data-theme` tokens stay in CSS; only **direction** (`dir="rtl"`) would need layout audits if you support Arabic/Hebrew.
