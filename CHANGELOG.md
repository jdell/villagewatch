# Changelog

Every release of VillageWatch. Generated from Conventional Commits by
`standard-version` — see CONTRIBUTING in the README for the commit format.

### [0.1.7](https://github.com/jdell/villagewatch/compare/v0.1.6...v0.1.7) (2026-07-27)


### Features

* **whatsapp:** copy the published alert instead of posting it ([f791940](https://github.com/jdell/villagewatch/commit/f791940f1b6e374049ec3678a6a08c5988b9f3f8))

### [0.1.6](https://github.com/jdell/villagewatch/compare/v0.1.5...v0.1.6) (2026-07-27)


### CI

* apply migrations and the two SQL files from a workflow ([d5ecb8c](https://github.com/jdell/villagewatch/commit/d5ecb8c7654436012222c564fd07572bc1067fc8))
* no-op the database workflow when DIRECT_URL is unset ([f0f2ab2](https://github.com/jdell/villagewatch/commit/f0f2ab2a6e3ca39b94b86e3d97fe88f95a4eec49))


### Documentation

* the migrations are applied and the OneSignal app exists ([19cec29](https://github.com/jdell/villagewatch/commit/19cec298c60d990c52c1e9fbdfe1c2f85621b6ea))


### Fixes

* **ui:** make the mobile navigation drawer reachable ([d0d7c73](https://github.com/jdell/villagewatch/commit/d0d7c732e08493d347de33fbe9c13e0496bfaf59))

### [0.1.5](https://github.com/jdell/villagewatch/compare/v0.1.4...v0.1.5) (2026-07-27)


### Features

* **moderation:** per-village auto-approve ([d1f870c](https://github.com/jdell/villagewatch/commit/d1f870cd370f007fa77a1552ce954b2ff36d528d))

### [0.1.4](https://github.com/jdell/villagewatch/compare/v0.1.3...v0.1.4) (2026-07-27)


### Features

* **whatsapp:** derive the channel code from the invite link ([aa0df37](https://github.com/jdell/villagewatch/commit/aa0df3714576048267ce47e045b10a6a4496b222))

### [0.1.3](https://github.com/jdell/villagewatch/compare/v0.1.2...v0.1.3) (2026-07-27)


### Features

* right to erasure and persistent rate limiting ([752e6cf](https://github.com/jdell/villagewatch/commit/752e6cf4128449d9c3354ca71dd7d1934b274eab))

### [0.1.2](https://github.com/jdell/villagewatch/compare/v0.1.1...v0.1.2) (2026-07-27)


### Features

* **admin:** gate platform admin on ADMIN_EMAILS, add Slack staff alerts ([a4e4810](https://github.com/jdell/villagewatch/commit/a4e4810e965d1d8b84808faee664301e4dd39d9a))
* **auth:** add a searchable village picker ([a63cda6](https://github.com/jdell/villagewatch/commit/a63cda6b196046f8191183751c3bbf830dfbb3de))
* **auth:** add Google sign-in with a /welcome step for the missing half ([c94328f](https://github.com/jdell/villagewatch/commit/c94328f7db76b50aa6b9603f71efdcba69462880))
* **auth:** add password recovery ([7fcf21a](https://github.com/jdell/villagewatch/commit/7fcf21a48e0ab029c98ed9d249ea7b8c7bd1ea21))
* **coordinators:** request and approve coordinator access ([7262e7b](https://github.com/jdell/villagewatch/commit/7262e7b3aa0cd87e3fa684b7d4d901325a18a825))
* **db:** add the initial migration and drop extension tracking ([f8a0d38](https://github.com/jdell/villagewatch/commit/f8a0d38f8763ed36481ecafd19237d8f81e2fd17))
* **nav:** separate the platform admin link from the village nav ([7e31a2e](https://github.com/jdell/villagewatch/commit/7e31a2e07888a030f50b081c68d74c6e298e2b1d))
* **whatsapp:** per-village channel settings on the dashboard ([c63adfe](https://github.com/jdell/villagewatch/commit/c63adfebe08347d93b7c4f16ba16b99b6318f3f0))


### Documentation

* explain the Google sign-in redirect that lands on localhost ([0093b65](https://github.com/jdell/villagewatch/commit/0093b6545cbd810a0321bbb5879d8dfa471f4982))
* record the sample coordinator account ([20b5f51](https://github.com/jdell/villagewatch/commit/20b5f511985d13a2a57bda1f4f13f4fdaf6746ab))
* record the session-pooler requirement and the extension-drift trap ([2c17d43](https://github.com/jdell/villagewatch/commit/2c17d439951d323e45e6415eae5a665385598014))


### CI

* lint, typecheck and build every pull request ([bfb8d2e](https://github.com/jdell/villagewatch/commit/bfb8d2e28acceab3480a5024bd1d020bb2b92822))


### Fixes

* **map:** stop Leaflet drawing over the mobile navigation ([861e8ee](https://github.com/jdell/villagewatch/commit/861e8ee3f679f188273b9d9ce433d7d15afdfd54))
* regenerate package-lock.json to match package.json ([91c5aa5](https://github.com/jdell/villagewatch/commit/91c5aa5f8f13f854a4f42a75153824466fdb76e1))
* **rls:** grant schema usage explicitly instead of assuming Supabase defaults ([a28f751](https://github.com/jdell/villagewatch/commit/a28f751fb926f9438db6a03ce695d065670cb77b))
* **rls:** let an account be deleted without weakening the audit trail ([5e63a5c](https://github.com/jdell/villagewatch/commit/5e63a5c1270b167a60469622bd0a7b9c26e617df))
* **rls:** put raw_description and join_code behind column grants ([e2882d3](https://github.com/jdell/villagewatch/commit/e2882d306bd62f1a4b8e35190be9d88e4c83d6ed))
* **seed:** leave an existing village's status alone ([2e7fcea](https://github.com/jdell/villagewatch/commit/2e7fcea559fd7731a5fa95eca319d634c796b700))

### 0.1.1 (2026-07-27)


### Features

* Days 6-7 — deploy config, retention cron, PWA, and go-to-market ([69a00e9](https://github.com/jdell/villagewatch/commit/69a00e916a6cf9d653a0d8fa7e164c3fb961f4fc))
* seed the village directory from ONS open data ([6023f7b](https://github.com/jdell/villagewatch/commit/6023f7bd8cd95bed63011127d3b028aee98db6d2))
* WhatsApp Channel alerts ([dfff562](https://github.com/jdell/villagewatch/commit/dfff562098217aec0df67b3de7b1735706abf7f7))
