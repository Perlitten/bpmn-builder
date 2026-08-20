# Changelog

## [0.2.0](https://github.com/Perlitten/bpmn-builder/compare/bpmn-builder-v0.1.0...bpmn-builder-v0.2.0) (2026-08-20)

### Features

* add automated releases and surface the build version ([#20](https://github.com/Perlitten/bpmn-builder/issues/20))
* add multilingual conditional keywords ([#15](https://github.com/Perlitten/bpmn-builder/issues/15))
* turn the pre-login page into an interactive BPMN showcase ([d1f4340](https://github.com/Perlitten/bpmn-builder/commit/d1f4340d02f223ee730736d5ee0478a0d7902e3b))
* establish the production repository, CI, deployment, and governance foundation ([3c63d1c](https://github.com/Perlitten/bpmn-builder/commit/3c63d1c8e98e7e05b53a6688bb68abff32bbdc20))

### Reliability and UX

* make Google OAuth work safely across Vercel previews with signed relay state and one-time handoffs ([#11](https://github.com/Perlitten/bpmn-builder/pull/11))
* improve layout reconvergence, XOR branch separation, lane bounds, and label collision handling ([43778e1](https://github.com/Perlitten/bpmn-builder/commit/43778e1bad68d0ce087b75ece4fd98aa0cfa7517))
* correct showcase process generation and add accessibility coverage ([#28](https://github.com/Perlitten/bpmn-builder/pull/28))
* polish onboarding, process lists, and accessible metadata ([#19](https://github.com/Perlitten/bpmn-builder/issues/19))
* report accurate lint metrics and geometry findings ([#17](https://github.com/Perlitten/bpmn-builder/issues/17))
* stabilize database driver selection, migrations, and E2E CI setup ([5ac8bfc](https://github.com/Perlitten/bpmn-builder/commit/5ac8bfc5889993f6e422873f7bd4ece0ec532758))

### Security and Quality

* harden XML parsing against quadratic work, regex injection, and prototype pollution ([#26](https://github.com/Perlitten/bpmn-builder/pull/26))
* complete CodeQL, dependency, secret-scanning, Lighthouse, and supply-chain hardening ([#25](https://github.com/Perlitten/bpmn-builder/pull/25))
* update the transitive `tmp` dependency to the patched release ([#29](https://github.com/Perlitten/bpmn-builder/pull/29))

## Changelog

All notable changes to this project are automatically documented here by release-please based on commit messages.
