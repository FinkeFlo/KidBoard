# Changelog

## 1.0.0 (2026-11-22)


### Features

* **deploy:** add Cloudflare deploy script, button, guide and static CSP (T-25) ([18105eb](https://github.com/FinkeFlo/KidBoard/commit/18105eb0918da06b385ecd8419caf50d1f349775))
* **shared:** add calendar title parser (T-07) ([e07d400](https://github.com/FinkeFlo/KidBoard/commit/e07d400e35a01c0bea501070aea15b3dc32bcc7e))
* **shared:** add data model and config schema (T-06) ([7ca1668](https://github.com/FinkeFlo/KidBoard/commit/7ca1668077543b7429118950385c53066e0c0feb))
* **web:** add automatic night mode with warm theme and theme-color (T-21) ([3a2aaa4](https://github.com/FinkeFlo/KidBoard/commit/3a2aaa4ef0ee0728d0ac99f16b63bc9335e5e690))
* **web:** add burn-in orbit shift and fixed bottom status slot (T-22) ([fbf25ab](https://github.com/FinkeFlo/KidBoard/commit/fbf25ab30826eb4c4ea5aea654c89c4f9c26a7bd))
* **web:** add core event, meal, legend and status components (T-15) ([c6dcacc](https://github.com/FinkeFlo/KidBoard/commit/c6dcacc0cec177689970e33af8acfce5e1192b37))
* **web:** add day view with bands, meals and states (T-17) ([110cf35](https://github.com/FinkeFlo/KidBoard/commit/110cf357a3960023ec4f5cc7088fd0881189b0fe))
* **web:** add demo fixture, generated screenshots and glanceability pass (T-24) ([99f2689](https://github.com/FinkeFlo/KidBoard/commit/99f26894e1678b465a5da78936f363032d878ccd))
* **web:** add how-many-sleeps countdown and 31-day agenda range (T-19) ([55c3587](https://github.com/FinkeFlo/KidBoard/commit/55c3587dd3d2f5404ccaaf46c77ee46dd52a4c68))
* **web:** add i18n with de/en locales and zone-aware formatting (T-12) ([2a9eb90](https://github.com/FinkeFlo/KidBoard/commit/2a9eb90ec04c0b1a8cde4949ffddd998288335f7))
* **web:** add installable pwa with offline app shell (T-14) ([38c632c](https://github.com/FinkeFlo/KidBoard/commit/38c632c25c9e2e341e24a81a2430efb53820f55c))
* **web:** add minute clock, zone-aware day rollover and offline seeding (T-16) ([b97ec66](https://github.com/FinkeFlo/KidBoard/commit/b97ec6658a5f257ca4da76c43d6c5938f6b241b7))
* **web:** add overview model, column layout and child tint logic (T-30a) ([f7d083f](https://github.com/FinkeFlo/KidBoard/commit/f7d083ff9e483216167ec4d0a50abd24c5986778))
* **web:** add tailwind design tokens, fonts and app shell (T-11) ([6040acc](https://github.com/FinkeFlo/KidBoard/commit/6040acc8a41a766297c22829cf98a9f05f32f17d))
* **web:** add typed api client and persisted query data layer (T-13) ([4538f68](https://github.com/FinkeFlo/KidBoard/commit/4538f68a915b2fe08dce78690e5606af3ba2aa92))
* **web:** add week view, day/week toggle and auto-return (T-18) ([7043d66](https://github.com/FinkeFlo/KidBoard/commit/7043d6650438193f08327be15acd75781bd8e5ac))
* **web:** adopt final design tokens with extended contrast tests (T-29) ([777e0b3](https://github.com/FinkeFlo/KidBoard/commit/777e0b3e0a0226e19e0322c067c743bea781da3c))
* **web:** keep screen awake, add fullscreen control and auto-recovering error boundary (T-20) ([846cbb1](https://github.com/FinkeFlo/KidBoard/commit/846cbb163c8cfd80874e5a0cc9d09624e444e916))
* **web:** make the four-day overview the main screen with nav rail (T-30b) ([8ba5439](https://github.com/FinkeFlo/KidBoard/commit/8ba54392edae24adce3aba758e5db23378e377ee))
* **worker:** normalize occurrences into events and meals (T-09) ([b10d163](https://github.com/FinkeFlo/KidBoard/commit/b10d163f959108a7ecdf8ccb6743cd7601869a15))
* **worker:** parse and expand ical feeds with ical.js (T-08) ([60e561b](https://github.com/FinkeFlo/KidBoard/commit/60e561bf335b0ad719cca83c58170b59111c6b27))
* **worker:** serve agenda, config and health api with kv cache (T-10) ([bb0b4ab](https://github.com/FinkeFlo/KidBoard/commit/bb0b4ab11a43e000adc1b009ba49d4065a7d8ad8))


### Bug Fixes

* **ci:** allowlist synthetic test string flagged by gitleaks ([d11567f](https://github.com/FinkeFlo/KidBoard/commit/d11567ff0d71d0229535f466e46849048a817db2))
* **ci:** keep pre-rewrite gitleaks fingerprint for dependabot branches ([0cbe320](https://github.com/FinkeFlo/KidBoard/commit/0cbe320bbf7f9cae0c16e7b559b35129d63c6504))
* **ci:** update gitleaks fingerprint after history rewrite ([34e7296](https://github.com/FinkeFlo/KidBoard/commit/34e7296177c92565cf2888e7719330d0d6f49589))
* **web:** explain offline state without a saved plan (T-17) ([2e710dd](https://github.com/FinkeFlo/KidBoard/commit/2e710dd07c43721908814a754ff5f5c1baaaec07))
* **web:** format date-only keys as calendar days in the configured zone (T-12) ([815815d](https://github.com/FinkeFlo/KidBoard/commit/815815d13ae5cf8e4d38d09bf7b063acce985a98))
* **web:** keep wake lock through errors, fit dense day bands, quiet control token ([614dd63](https://github.com/FinkeFlo/KidBoard/commit/614dd6306f58ccaab2d2e5887127a6fc5d7f4845))
