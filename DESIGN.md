# Fikra design system

Fikra uses a dark, editorial timeline with familiar social-network ergonomics and a quieter personal-site character. Interfaces are flat, compact, and content-led; borders define structure without turning every region into a card.

- Display: Cal Sans. UI/body: system sans-serif stack.
- Primary surface: near-black; text: warm off-white; accent: periwinkle.
- Buttons are mostly pill-shaped, two-dimensional, and use a restrained highlight.
- Timeline rows are fully clickable while nested controls preserve their own actions.
- Owner-only controls appear in context rather than in a separate visual universe.
- Motion is short and purposeful, with reduced-motion support.
- Forms use explicit labels, visible focus, inline validation, and reversible previews.
- Mobile navigation preserves the core timeline and compose flows without horizontal overflow.

New UI should reuse tokens in `app/app.css`, keep semantic HTML, meet WCAG AA contrast, and be exercised at desktop and mobile widths.
