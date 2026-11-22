# Contributing

[English](#english) | [Deutsch](#deutsch)

## English

Thanks for helping! Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

### Setup

Requires Node 22 and pnpm 10 (via corepack).

```sh
pnpm install
pnpm dev            # web (Vite) + worker (wrangler dev)
```

For local worker secrets copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars`
(see [docs/CONFIG.md](docs/CONFIG.md)).

### Commands and quality gate

```sh
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
pnpm test:e2e       # Playwright (tablet viewports)
pnpm format         # auto-format
```

The gate must be green before every commit and pull request.

### Commits

[Conventional Commits](https://www.conventionalcommits.org/), e.g.
`feat(web): add week view (T-14)`. [lefthook](https://lefthook.dev/) runs checks and
commitlint on commit; do not bypass the hooks.

### Plan and ADR workflow

- [docs/PLAN.md](docs/PLAN.md) is binding: work its tasks (T-xx) in order and link the task in
  your pull request.
- Significant technical decisions get an ADR in [docs/adr/](docs/adr/) (copy the template).
- Plan changes are made consciously: edit PLAN.md, add a change-log entry, separate commit
  `docs(plan): ...`.

### Rules

- **i18n:** UI strings only via `apps/web/src/i18n/locales/{de,en}.json`; both locales complete.
- **No secrets:** never commit iCal URLs, tokens, `.env` or `.dev.vars` files, or real calendar
  data. Fixtures are synthetic.
- **Tests required:** new behavior comes with tests next to the code (`*.test.ts(x)`).
- Code, comments and commit messages in English; user docs in English and German.
- Calendar titles are untrusted plain text: never use `dangerouslySetInnerHTML`.

## Deutsch

Danke für deine Hilfe! Bitte lies zuerst den [Verhaltenskodex](CODE_OF_CONDUCT.md) (englisch).

### Einrichtung

Benötigt Node 22 und pnpm 10 (über corepack): `pnpm install`, dann `pnpm dev`. Lokale
Worker-Secrets: `apps/worker/.dev.vars.example` nach `apps/worker/.dev.vars` kopieren
(siehe [docs/CONFIG.md](docs/CONFIG.md)).

### Befehle und Qualitätsprüfung

`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build` muss vor jedem
Commit und Pull Request grün sein. E2E-Tests: `pnpm test:e2e`, Formatieren: `pnpm format`.

### Commits

[Conventional Commits](https://www.conventionalcommits.org/), z. B.
`feat(web): add week view (T-14)`. lefthook prüft beim Commit (inkl. commitlint); Hooks nicht
umgehen.

### Plan- und ADR-Ablauf

- [docs/PLAN.md](docs/PLAN.md) ist verbindlich: Aufgaben (T-xx) der Reihe nach bearbeiten und
  im Pull Request verlinken.
- Wichtige technische Entscheidungen bekommen ein ADR in [docs/adr/](docs/adr/).
- Planänderungen bewusst: PLAN.md ändern, Change-Log-Eintrag, eigener Commit `docs(plan): ...`.

### Regeln

- **i18n:** UI-Texte nur über `apps/web/src/i18n/locales/{de,en}.json`, beide Sprachen komplett.
- **Keine Geheimnisse:** niemals iCal-URLs, Tokens, `.env`/`.dev.vars` oder echte Kalenderdaten
  einchecken. Fixtures sind synthetisch.
- **Tests Pflicht:** neues Verhalten kommt mit Tests neben dem Code.
- Code, Kommentare und Commits auf Englisch; Nutzerdokumentation auf Englisch und Deutsch.
