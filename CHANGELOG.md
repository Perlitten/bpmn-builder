# Changelog

## [0.6.0](https://github.com/Perlitten/bpmn-builder/compare/bpmn-builder-v0.5.0...bpmn-builder-v0.6.0) (2026-08-22)


### Features

* collapsible process preview and cleaner header ([567092c](https://github.com/Perlitten/bpmn-builder/commit/567092c00037d7e7c6ec77393534f13c12215c69))
* complete editor design system contract ([#48](https://github.com/Perlitten/bpmn-builder/issues/48)) ([1082689](https://github.com/Perlitten/bpmn-builder/commit/1082689be3bfabd07d559ff8a0c85444d97525cf))
* **process-list:** add collapsible preview mode ([857ff2c](https://github.com/Perlitten/bpmn-builder/commit/857ff2c1d0e4dc53ca5865a0038baec7ecf43e96))


### Bug Fixes

* harden audited workflow paths ([fa6c415](https://github.com/Perlitten/bpmn-builder/commit/fa6c415443737742f3cb0c7141b14efb03e4a0d0))
* harden audited workflow paths ([1375db7](https://github.com/Perlitten/bpmn-builder/commit/1375db783f426a67ec9684636b3a35134aa57226))
* make Vercel runtime imports traceable ([#49](https://github.com/Perlitten/bpmn-builder/issues/49)) ([141fe6b](https://github.com/Perlitten/bpmn-builder/commit/141fe6b5f273bd9fa3064f8584fde626c25a13cc))
* **process-list:** preserve mobile actions and focus ([95a5f81](https://github.com/Perlitten/bpmn-builder/commit/95a5f8172d9796ee4ef20b945f88a89aeba93816))
* **simulate:** complete subprocess and link semantics ([c0ac099](https://github.com/Perlitten/bpmn-builder/commit/c0ac099e6ad7b424ec58fdcb6b48f1968ad58650))


### Refactoring

* separate process models and remove dead APIs ([c0b5f63](https://github.com/Perlitten/bpmn-builder/commit/c0b5f632d79aa704af6e67b36a1b583826fca073))

## [0.5.0](https://github.com/Perlitten/bpmn-builder/compare/bpmn-builder-v0.4.0...bpmn-builder-v0.5.0) (2026-08-22)


### Features

* complete product audit and rebuild landing ([b04494b](https://github.com/Perlitten/bpmn-builder/commit/b04494bc45926d2b52522fce82736c3584e64c5a))
* rebuild landing showcase and harden preview ([06dca37](https://github.com/Perlitten/bpmn-builder/commit/06dca37c8e06e43e41642c4cd1a8ee8d8e5bce8c))
* redesign process list workbench ([5440566](https://github.com/Perlitten/bpmn-builder/commit/544056664efaf503778c9a1354205dd9a3a9eee3))


### Bug Fixes

* close ci security and visual findings ([500a86d](https://github.com/Perlitten/bpmn-builder/commit/500a86d9465296abbca8dc40fdb325b4c97815b5))
* close remaining audit gaps ([86f2ca4](https://github.com/Perlitten/bpmn-builder/commit/86f2ca4e70ffaba9b320dbb30b1efccaa4e7ada2))
* harden architect and swimlane workflows ([1bc3a4c](https://github.com/Perlitten/bpmn-builder/commit/1bc3a4c00a686b263b9d3af8e0c09bb4f4136481))
* keep test runtime compatible with CI ([79864b6](https://github.com/Perlitten/bpmn-builder/commit/79864b6fb730f1a66243b3fbbab876391df862cb))
* resolve full product audit findings ([c54af18](https://github.com/Perlitten/bpmn-builder/commit/c54af1842afccd2732bc411ca46d93fb78cef271))
* resolve process list review blockers ([1e9072c](https://github.com/Perlitten/bpmn-builder/commit/1e9072c47007d6ca8b0df0d1a492240ee7d9e52d))
* resolve remaining review risks ([c3e3956](https://github.com/Perlitten/bpmn-builder/commit/c3e3956630171038ca3f3ef9cdd9e9151e855ade))
* satisfy complete wildcard escaping ([3b2ea32](https://github.com/Perlitten/bpmn-builder/commit/3b2ea326067c676a60df9cdd57128977e8afce48))
* stabilize visual preview checks ([be415da](https://github.com/Perlitten/bpmn-builder/commit/be415dac9380296f6771423412931f64b661a78f))

## [0.4.0](https://github.com/Perlitten/bpmn-builder/compare/bpmn-builder-v0.3.0...bpmn-builder-v0.4.0) (2026-08-21)


### Features

* **web:** adopt product design system components ([fa8d93e](https://github.com/Perlitten/bpmn-builder/commit/fa8d93eca45eabcb246cd79b0f7056f7813ef1c0))

## [0.3.0](https://github.com/Perlitten/bpmn-builder/compare/bpmn-builder-v0.2.0...bpmn-builder-v0.3.0) (2026-08-21)


### Features

* rebuild landing with reusable design system ([#32](https://github.com/Perlitten/bpmn-builder/issues/32)) ([5dbddb7](https://github.com/Perlitten/bpmn-builder/commit/5dbddb7bffd30a7563190623d687af57950b9306))

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
