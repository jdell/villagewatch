# Changelog

Every release of VillageWatch. Generated from Conventional Commits by
`standard-version` — see CONTRIBUTING in the README for the commit format.

### [0.1.17](https://github.com/jdell/villagewatch/compare/v0.1.16...v0.1.17) (2026-07-28)


### Features

* **docs:** a practical guide for the person running a village ([05c180b](https://github.com/jdell/villagewatch/commit/05c180b4ef339afe35964825450967dd7651bfaf))
* **scripts:** empty one village and re-open its compliance gate ([c80065b](https://github.com/jdell/villagewatch/commit/c80065b08ebb187b7c26397f29c3cde91da56e15))

### [0.1.16](https://github.com/jdell/villagewatch/compare/v0.1.15...v0.1.16) (2026-07-28)


### Features

* **compliance:** the processing agreement a council signs with us ([980a9a2](https://github.com/jdell/villagewatch/commit/980a9a24a8feee107b864bdb16e1e5b1f8b514b7))

### [0.1.15](https://github.com/jdell/villagewatch/compare/v0.1.14...v0.1.15) (2026-07-28)


### Features

* **privacy:** let a village choose how faces are covered ([399b950](https://github.com/jdell/villagewatch/commit/399b950ebe38e7419b77d86c84bd0f37ee2b6ffd))


### Documentation

* **dpia:** a summary at the top, and §9 split by who owns each action ([2430916](https://github.com/jdell/villagewatch/commit/24309166d12994f19599900fffd0191074671147))
* rewrite the DPIA and the APD for the people who sign them ([fa0a037](https://github.com/jdell/villagewatch/commit/fa0a03707663885be250dd1b687fbf38e2b94f7a))

### [0.1.14](https://github.com/jdell/villagewatch/compare/v0.1.13...v0.1.14) (2026-07-27)


### Features

* **compliance:** gate a village's reporting on the DPIA and the APD ([ba3876e](https://github.com/jdell/villagewatch/commit/ba3876efe445946a44f9e0556febd9fc93242780))
* **markdown:** render the compliance documents from docs/ without a dependency ([e7189d6](https://github.com/jdell/villagewatch/commit/e7189d6e953b89e8f389c5a30dfef04e23068e6d))
* **schema:** record the DPIA and APD acceptance on the village ([adc1461](https://github.com/jdell/villagewatch/commit/adc146192c8cb5a3d3694108bf30b848b6dc026a))


### Documentation

* **apd:** add the Appropriate Policy Document template ([0c77ef0](https://github.com/jdell/villagewatch/commit/0c77ef0f9528afde6c998db55cb822b57437e942))
* the compliance gate, and what applying its migration does ([ff55c2e](https://github.com/jdell/villagewatch/commit/ff55c2e1099cf6b5645cce10f3354f9248b0e2a8))

### [0.1.13](https://github.com/jdell/villagewatch/compare/v0.1.12...v0.1.13) (2026-07-27)


### Features

* **scripts:** add a dry-run cleanup for the seed village's sample data ([e726f14](https://github.com/jdell/villagewatch/commit/e726f1419a07b9ca5ead9b3516502e190d3b925c))


### Fixes

* **push:** resolve the OneSignal app id from either variable, and read the send response ([320bc95](https://github.com/jdell/villagewatch/commit/320bc95a130cf8218bce04e55da287941b12a107))


### Documentation

* **backlog:** close the July work and record what is left ([1175b50](https://github.com/jdell/villagewatch/commit/1175b50f6b761cac122cd8390e8356b524d39b7a)), closes [#3](https://github.com/jdell/villagewatch/issues/3)
* **dpia:** assess the processing before a real resident registers ([a1de6e2](https://github.com/jdell/villagewatch/commit/a1de6e2d958dcd6ee69460a0e81bdfed726f5d48))
* **setup:** document the migration order and what is still unapplied ([4f3968b](https://github.com/jdell/villagewatch/commit/4f3968b192d4a07231184bd18f6405edb71cc7dc))
* the OneSignal checklist, the seed cleanup, and a walk through the ten core flows ([c204c18](https://github.com/jdell/villagewatch/commit/c204c18a75c495762e76cdaa71233087ca60a1b0))

### [0.1.12](https://github.com/jdell/villagewatch/compare/v0.1.11...v0.1.12) (2026-07-27)


### Features

* **dashboard:** let a coordinator name their parish council ([af68167](https://github.com/jdell/villagewatch/commit/af68167e2245cc1a2f829349e01d19763031deca))

### [0.1.11](https://github.com/jdell/villagewatch/compare/v0.1.10...v0.1.11) (2026-07-27)


### Features

* **media:** redact faces with a black box by default ([09f429d](https://github.com/jdell/villagewatch/commit/09f429d01b83c1528b3e772980ddf082477b5079))


### CI

* run the test suite between the typecheck and the build ([ef3edef](https://github.com/jdell/villagewatch/commit/ef3edefc000dd535d5d8bf0ed8542e85d6c9f399))


### Documentation

* **privacy:** disclose the Slack staff channel instead of claiming a DPA ([e7a83f8](https://github.com/jdell/villagewatch/commit/e7a83f8bfd3b86d455cad31cf64ad5e00655ae79))
* record the test suite, the CI gate and the Slack disclosure ([6fab2de](https://github.com/jdell/villagewatch/commit/6fab2de02ccd9e4448fd1019049f9e6ab567fb45))


### Fixes

* **dashboard:** make the CSV export report its own failures ([7cc979b](https://github.com/jdell/villagewatch/commit/7cc979b6b9e99822edff1f7a6bec4042998a9a4a))


### Refactoring

* **auth:** share the home location step and name its jitter ([344041c](https://github.com/jdell/villagewatch/commit/344041c9646e823574a490affa0120561c5c998f))

### [0.1.10](https://github.com/jdell/villagewatch/compare/v0.1.9...v0.1.10) (2026-07-27)


### Fixes

* **ci:** read DIRECT_URL from the Production environment ([5b76757](https://github.com/jdell/villagewatch/commit/5b7675776cd3e92ab30280250d396725ce679d01))
* **reports:** survive a database without parish_council ([522270a](https://github.com/jdell/villagewatch/commit/522270ae0213fdc4449b70c59f6b729b225a3c88))

### [0.1.9](https://github.com/jdell/villagewatch/compare/v0.1.8...v0.1.9) (2026-07-27)


### Features

* **reports:** share incident summaries with police and the parish council ([f42611f](https://github.com/jdell/villagewatch/commit/f42611f9c5fe569a634873498e0c56e503ce4c8c))


### Documentation

* add backlog and improvements tracker ([1bfba00](https://github.com/jdell/villagewatch/commit/1bfba00a0d30aa3232be0921e0aa15999878ae18))

### [0.1.8](https://github.com/jdell/villagewatch/compare/v0.1.7...v0.1.8) (2026-07-27)


### Fixes

* **ui:** size the map to the dynamic viewport, animate the drawer in ([8a4cad7](https://github.com/jdell/villagewatch/commit/8a4cad7c8618fde880a3cb306af403929486756b))

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
