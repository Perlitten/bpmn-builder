# Tailwind Token Layer

## Existing Semantic Tokens
The application defines a partial semantic token layer in `apps/web/src/index.css` via the Tailwind v4 `@theme` directive:

- `color-ink`: `#0f172a` (used for primary text, e.g., `text-ink`)
- `color-muted`: `#64748b` (used for secondary text/icons, e.g., `text-muted`)
- `color-border`: `#e2e8f0` (used for standard borders, e.g., `border-border`)
- `color-surface`: `#f8fafc` (used for subtle backgrounds, e.g., `bg-surface`)
- `color-canvas`: `#ffffff` (used for main backgrounds, e.g., `bg-canvas`)
- `color-accent`: `#0f766e` (used for primary actions/highlights, e.g., `bg-accent`, `text-accent`)
- `color-danger`: `#fb7185` (used for error states, e.g., `text-danger`)
- `duration-ui`: `160ms`
- `ease-ui`: `cubic-bezier(0.2, 0, 0, 1)`

## Usage of Semantic Tokens
- `bg-surface`, `bg-canvas`, `text-ink`, `text-muted`, `border-border` are heavily used across components (`apps/web/src/App.tsx:33`, `apps/web/src/components/process-list/DuplicateProcessDialog.tsx:78`, `apps/web/src/components/process-list/DuplicateProcessDialog.tsx:63`, `apps/web/src/pages/ProcessListPage.tsx:398`).
- `bg-accent`, `text-accent`, `text-danger` are used for interactive states and validation.

## Bypasses & Arbitrary Values
The application bypasses semantic tokens in numerous places:


## Conflicts & Ambiguities
- **Hover/Active States**: The token layer completely lacks states. Consequently, `hover:bg-slate-100` and `hover:bg-teal-700` are hardcoded throughout instead of using `hover:bg-surface-hover` or `hover:bg-accent-hover`.
- **Borders vs Dividers**: `border-border` is used both for form input borders (which might need higher contrast) and layout dividers (which might need lower contrast).
