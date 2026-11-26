# Compact landing: hero and How it works only

- The compact landing page (`VITE_NEW_LANDING` off) now shows only the hero and the How it works stages. The "In every sandbox" card and the "Built on" footer are gone.
- The compact hero uses a short, non-technical lede (`LANDING_HERO.compactLede`). `LandingHero`'s `signInOnly` prop is now `compact`, because it changes the lede as well as the actions.
- `LANDING_HERO_CAPABILITIES` and `LandingCapabilityLine` had no other users, so they are removed.
