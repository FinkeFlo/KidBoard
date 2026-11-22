# Changelog

## 1.0.0 (2026-11-22)


### Features

* **deploy:** add Cloudflare deploy script, button, guide and static CSP (T-25) ([5eb6b44](https://github.com/FinkeFlo/KidBoard/commit/5eb6b449da4603b34ddb13e92b4bbc8fb80a2fd0))
* **shared:** add calendar title parser (T-07) ([72b1b9e](https://github.com/FinkeFlo/KidBoard/commit/72b1b9ea00d47be537df21c0c5512a285db01c2c))
* **shared:** add data model and config schema (T-06) ([70a0924](https://github.com/FinkeFlo/KidBoard/commit/70a09242bc591d644246dba1e96da52101ebc149))
* **web:** add automatic night mode with warm theme and theme-color (T-21) ([ab9377a](https://github.com/FinkeFlo/KidBoard/commit/ab9377aba23205034ed3d812e538d77dcf869c0a))
* **web:** add burn-in orbit shift and fixed bottom status slot (T-22) ([f70879e](https://github.com/FinkeFlo/KidBoard/commit/f70879ed1932d374d20c368f7f2e3a47c238c038))
* **web:** add core event, meal, legend and status components (T-15) ([5ec9329](https://github.com/FinkeFlo/KidBoard/commit/5ec932945e6206f0c626e4904681a81007bdadfb))
* **web:** add day view with bands, meals and states (T-17) ([fda3046](https://github.com/FinkeFlo/KidBoard/commit/fda304651d078e6aefb594eeabebec85bbfb95a7))
* **web:** add demo fixture, generated screenshots and glanceability pass (T-24) ([d28a7ad](https://github.com/FinkeFlo/KidBoard/commit/d28a7ad6e53dc7fce793db7782b749326d564ccd))
* **web:** add how-many-sleeps countdown and 31-day agenda range (T-19) ([e95aa86](https://github.com/FinkeFlo/KidBoard/commit/e95aa8607460876f1616ee85a5d1b735283ae921))
* **web:** add i18n with de/en locales and zone-aware formatting (T-12) ([91bfae1](https://github.com/FinkeFlo/KidBoard/commit/91bfae1a15bc91e81fad8819268cf0ee12d62639))
* **web:** add installable pwa with offline app shell (T-14) ([2763e3e](https://github.com/FinkeFlo/KidBoard/commit/2763e3e55a856501fbdb1661eff1a869bac2e246))
* **web:** add minute clock, zone-aware day rollover and offline seeding (T-16) ([f542b3a](https://github.com/FinkeFlo/KidBoard/commit/f542b3a62d2930fe437e340499935496e0d57671))
* **web:** add overview model, column layout and child tint logic (T-30a) ([468c9d9](https://github.com/FinkeFlo/KidBoard/commit/468c9d968248c7740d6222863b25b9360d2e74b2))
* **web:** add tailwind design tokens, fonts and app shell (T-11) ([bcd80fb](https://github.com/FinkeFlo/KidBoard/commit/bcd80fb40bbea2fa169a00f3168bc4e6e27c7f4b))
* **web:** add typed api client and persisted query data layer (T-13) ([143df53](https://github.com/FinkeFlo/KidBoard/commit/143df53f33a3a8c019b982f414c0bcd8fe633f10))
* **web:** add week view, day/week toggle and auto-return (T-18) ([889810c](https://github.com/FinkeFlo/KidBoard/commit/889810cb97ab3cd5e6188d1ed7226753f22dfd76))
* **web:** adopt final design tokens with extended contrast tests (T-29) ([6b1c09a](https://github.com/FinkeFlo/KidBoard/commit/6b1c09aaa6e94cd28b3bf10d440322b3c1ab75dc))
* **web:** keep screen awake, add fullscreen control and auto-recovering error boundary (T-20) ([d018edf](https://github.com/FinkeFlo/KidBoard/commit/d018edff4d42f10019b7bf14e4880ccdda0ac05b))
* **web:** make the four-day overview the main screen with nav rail (T-30b) ([8c5251c](https://github.com/FinkeFlo/KidBoard/commit/8c5251c629ea54944044516a46984e7703278c04))
* **worker:** normalize occurrences into events and meals (T-09) ([a637100](https://github.com/FinkeFlo/KidBoard/commit/a6371005744975b3cb6da91b066cd1f06ac626e9))
* **worker:** parse and expand ical feeds with ical.js (T-08) ([4bc20ba](https://github.com/FinkeFlo/KidBoard/commit/4bc20ba88dd27e4739fb722ff1bb0c97c1ff6b3f))
* **worker:** serve agenda, config and health api with kv cache (T-10) ([b95b8d9](https://github.com/FinkeFlo/KidBoard/commit/b95b8d9223933cdd9c15b5b7249a53373d4bc5d3))


### Bug Fixes

* **ci:** allowlist synthetic test string flagged by gitleaks ([71ce9b0](https://github.com/FinkeFlo/KidBoard/commit/71ce9b0cc30884314031d32cf92157fa017e15e6))
* **ci:** keep pre-rewrite gitleaks fingerprint for dependabot branches ([22f5c87](https://github.com/FinkeFlo/KidBoard/commit/22f5c8745b763c057c12fe8a2f6b836ba8b57e1e))
* **ci:** update gitleaks fingerprint after history rewrite ([b8f81da](https://github.com/FinkeFlo/KidBoard/commit/b8f81da2b9b807420d7c269378b96a993b10d661))
* **web:** explain offline state without a saved plan (T-17) ([10d434c](https://github.com/FinkeFlo/KidBoard/commit/10d434c29404d24d1dbafa788eeae8fc06f8d9e3))
* **web:** format date-only keys as calendar days in the configured zone (T-12) ([620d83d](https://github.com/FinkeFlo/KidBoard/commit/620d83dad8757ee75ba2e8bccdbce7dda1ad0ac0))
* **web:** keep wake lock through errors, fit dense day bands, quiet control token ([4164510](https://github.com/FinkeFlo/KidBoard/commit/4164510abc4017bdc99760ba7485a0a43d60645c))
