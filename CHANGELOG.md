# Changelog

## [0.2.0](https://github.com/Perlitten/bpmn-builder/compare/bpmn-builder-v0.1.0...bpmn-builder-v0.2.0) (2026-08-20)


### Features

* automate releases and surface build version ([#20](https://github.com/Perlitten/bpmn-builder/issues/20)) ([120db2f](https://github.com/Perlitten/bpmn-builder/commit/120db2ff86cfc4b8242b261c70e773c2fc027182))
* production-grade repository foundation and workflow ([3c63d1c](https://github.com/Perlitten/bpmn-builder/commit/3c63d1c8e98e7e05b53a6688bb68abff32bbdc20))
* support multilingual conditional keywords ([#15](https://github.com/Perlitten/bpmn-builder/issues/15)) ([bbd2c94](https://github.com/Perlitten/bpmn-builder/commit/bbd2c946dd42a9ba2c92937197bd86fa9b420174))
* turn pre-login page into showcase with working demo ([d1f4340](https://github.com/Perlitten/bpmn-builder/commit/d1f4340d02f223ee730736d5ee0478a0d7902e3b))


### Bug Fixes

* align CodeQL suppressions ([3c765bf](https://github.com/Perlitten/bpmn-builder/commit/3c765bfba23f5aa2df075863523ea5cb79ccb051))
* **auth:** add short-lived preview handoff sessions ([b84cd2f](https://github.com/Perlitten/bpmn-builder/commit/b84cd2f7352214bb5594da664a660a1a1cf866bf))
* **auth:** preserve OAuth environment validation ([9deb646](https://github.com/Perlitten/bpmn-builder/commit/9deb6467c95f377a6a7c36fbeb7f46887fa4e307))
* **auth:** relay dynamic preview OAuth through stable callback ([ac8287b](https://github.com/Perlitten/bpmn-builder/commit/ac8287b7904bd09d7f806081f432316de0d8deb3))
* **auth:** sign relay state and consume short-lived handoffs ([83f6690](https://github.com/Perlitten/bpmn-builder/commit/83f6690b4d15c95de4103016cee85cc9c278ce5c))
* **auth:** support stable preview OAuth callback origin ([56359dc](https://github.com/Perlitten/bpmn-builder/commit/56359dc441c8d0f6836b2bf9f09ec590f2219cf8))
* ci workflow, vercel build command, drizzle indexes, and unpooled migration client ([5c81cb6](https://github.com/Perlitten/bpmn-builder/commit/5c81cb66531aded2b5d619dbaac4adb53a100756))
* **ci:** run OpenSSF Scorecard only on main ([f3c91aa](https://github.com/Perlitten/bpmn-builder/commit/f3c91aa5ea6ad7d620c04eefd872e32ed46d8cce))
* complete security and quality hardening ([c4a6c3e](https://github.com/Perlitten/bpmn-builder/commit/c4a6c3e137d9a35857ac8afea7dcb7ac5f8c522f))
* correct showcase process generation and add a11y coverage ([b993106](https://github.com/Perlitten/bpmn-builder/commit/b993106272e7b6ab7157d8a6741e06e96a21a034))
* database driver selection and e2e CI environment setup ([5ac8bfc](https://github.com/Perlitten/bpmn-builder/commit/5ac8bfc5889993f6e422873f7bd4ece0ec532758))
* derive OAuth state fingerprints with scrypt ([ae56206](https://github.com/Perlitten/bpmn-builder/commit/ae562069bfc05894544c42bbbeb3714024a36e78))
* harden OAuth state fingerprinting ([4100abb](https://github.com/Perlitten/bpmn-builder/commit/4100abbacbc0dc53de28d00e077c82213c64d2ac))
* hash OAuth state cookies ([7382a5b](https://github.com/Perlitten/bpmn-builder/commit/7382a5b568b369f798f2cf2d0615c81118a2cfbb))
* **layout-engine:** resolve unstructured split reconvergence, label collisions, and lane band bounds ([43778e1](https://github.com/Perlitten/bpmn-builder/commit/43778e1bad68d0ce087b75ece4fd98aa0cfa7517))
* **layout-engine:** separate XOR gateway branches and avoid label collisions ([f0427be](https://github.com/Perlitten/bpmn-builder/commit/f0427bec37e9642bcaf8a3423506259ef237909b))
* **layout-engine:** separate XOR gateway branches and avoid label collisions ([0eae6ef](https://github.com/Perlitten/bpmn-builder/commit/0eae6efdda20f2dddecbcfe0efe95dadc9d21a04))
* **layout-engine:** separate XOR gateway branches into distinct vertical bands and avoid edge label overlaps ([4b1fa8c](https://github.com/Perlitten/bpmn-builder/commit/4b1fa8c3f7a6500617cf690bb91e8c320f87129d))
* make Google OAuth work across Vercel previews ([3ed4f3f](https://github.com/Perlitten/bpmn-builder/commit/3ed4f3f46e55191837fcb8798958aebdc787ee3e))
* optimize XML parsing and add prototype pollution guards ([de64282](https://github.com/Perlitten/bpmn-builder/commit/de642826ceb4fc1470c4eacea733ea811b31f316))
* optimize XML parsing, fix regex injection, and add prototype pollution guards ([0cb6f13](https://github.com/Perlitten/bpmn-builder/commit/0cb6f134b69ac8c8251cb02f976d8e68b73508a4))
* polish onboarding, process list, and accessible metadata ([#19](https://github.com/Perlitten/bpmn-builder/issues/19)) ([3edbfe3](https://github.com/Perlitten/bpmn-builder/commit/3edbfe32b791d4593c6732facc1e6a0769d4ebf5))
* report accurate lint metrics and geometry findings ([#17](https://github.com/Perlitten/bpmn-builder/issues/17)) ([9a5e947](https://github.com/Perlitten/bpmn-builder/commit/9a5e9478798522b3dd8202f8123cacacfe30aee7))
* resolve code scanning alerts ([b94f492](https://github.com/Perlitten/bpmn-builder/commit/b94f492645cdce0844b2d817ac9feb781adff80d))
* resolve code scanning alerts ([2d5b69d](https://github.com/Perlitten/bpmn-builder/commit/2d5b69db7c60f5dcb596e69588e22da6e19dbcf2))
* securely port XML and prototype pollution guards with quadratic parsing fix ([4c971f2](https://github.com/Perlitten/bpmn-builder/commit/4c971f2c7dc6b7f0e16ce1cb91786c4ca7891127))
* securely port XML and prototype pollution guards with quadratic parsing fix ([c57c2c5](https://github.com/Perlitten/bpmn-builder/commit/c57c2c5b4c8e45af43dc0b22023be987ebd9f98c))
* update showcase examples for structural parsing ([17d3f6f](https://github.com/Perlitten/bpmn-builder/commit/17d3f6f245ad2dcb416f4fbe301bee773fd7e91e))
* update tmp to patched version ([32bd547](https://github.com/Perlitten/bpmn-builder/commit/32bd5472cd1006c140bf10c5a4176133ca83cc5d))
* update tmp to patched version ([9b2af92](https://github.com/Perlitten/bpmn-builder/commit/9b2af92afc7daddcc54670eb83f8940d9f042d2b))

## Changelog

All notable changes to this project are automatically documented here by release-please based on commit messages.
