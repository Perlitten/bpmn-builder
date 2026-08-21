# Tailwind Layer

## Existing Semantic Tokens

Defined in `apps/web/src/index.css`:
- `--color-ink: #0f172a`
- `--color-muted: #64748b`
- `--color-border: #e2e8f0`
- `--color-surface: #f8fafc`
- `--color-canvas: #ffffff`
- `--color-accent: #0f766e`
- `--color-danger: #fb7185`
- `--duration-ui: 160ms`
- `--ease-ui: cubic-bezier(0.2, 0, 0, 1)`

## Used Semantic Names
- `bg-surface` (Frequently used for secondary backgrounds)
- `bg-canvas` (Frequently used for primary backgrounds)
- `bg-ink` (Often used for inverted backgrounds or heavy emphasis)
- `bg-accent` (Action areas)
- `text-ink` (Main text color)
- `text-muted` (Secondary text)
- `text-canvas` (Inverted text)
- `border-border` (Generic borders)
- `border-ink` (Heavy emphasis borders)
- `border-danger` (Error states)

## Bypassed Layer
- Random arbitrary values exist like `w-[220px]` and `h-[220px]` in `apps/web/src/components/showcase/ShowcaseDemo.tsx`. These should map to a sizing scale or responsive utilities.
- Occasional static colors found in inline styles and SVGs should map to nearest tokens like `--color-ink` or `--color-muted`.
- `apps/web/src/components/showcase/ShowcaseDemo.tsx:12` uses explicit arbitrary `bg-[#f0f0f0]` which should map to `bg-surface`.

## Conflicts
- `border-border` vs `border-ink` depending on context, creating inconsistent emphasis for bordered components.
- `text-muted` vs opacity classes on `text-ink` leading to conflicting ways of styling secondary text.
