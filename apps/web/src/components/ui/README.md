# Product UI contract

The authenticated product uses the flat modeling-tool system defined in
`src/styles/tokens.css` and `ui.css`. The marketing landing is intentionally a
separate visual layer and must not import product motion, density, or component
geometry.

## Rules

- Product components read semantic CSS variables; raw colors belong in
  `tokens.css` only.
- Resting surfaces are canvas white. `surface` is reserved for hover feedback.
- Controls use square geometry, with `2px` radius only for compact rail/category
  hit areas.
- A button owns a `44px` hit area and a `26px` visual box. Loading writes keep
  their label width, set `aria-busy`, and use a gerund label.
- Decorative hairlines use `border`; interactive edges use
  `border-interactive`. Disabled controls use the dedicated disabled ink and
  edge tokens.
- Product focus is one `2px` ink outline at `2px` offset. Text fields indicate
  focus by darkening their edge.
- Menus, dialogs, the palette, inspector, zoom controls, and Architect use named
  layer tokens.

## Primitives

`Button`, `IconButton`, `TextField`, `TextAreaField`, `SelectField`, `Dialog`,
`ChromeMenu`, `PressedToggle`, `Avatar`, `ModeBar`, `SaveStatus`, and `Skeleton`
are the shared product primitives. Domain components may compose them but should
not recreate their interaction states locally.

The contract is guarded by `designSystem.test.ts` and the desktop/mobile editor
geometry and accessibility checks in `e2e/design-system.spec.ts`.
