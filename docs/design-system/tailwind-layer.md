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
- `bg-surface`, `bg-canvas`, `text-ink`, `text-muted`, `border-border` are heavily used across components (`AppShell.tsx`, `Button.tsx`, `TextField.tsx`, `ProcessRow.tsx`).
- `bg-accent`, `text-accent`, `text-danger` are used for interactive states and validation.

## Bypasses & Arbitrary Values
The application bypasses semantic tokens in numerous places:

- **Surface Bypass**: `bg-slate-100` (`apps/web/src/components/process-list/ProcessRow.tsx:12`, `apps/web/src/components/ui/Button.tsx:45`), `bg-slate-50` (`apps/web/src/components/shell/AppShell.tsx:28`), `bg-white/50` (`apps/web/src/components/process-list/TemplatesSection.tsx:15`). Should use `bg-surface` or define shades like `bg-surface-hover`.
- **Muted Bypass**: `text-slate-500` (`apps/web/src/components/process-list/ProcessRow.tsx:28`), `text-slate-400` (`apps/web/src/components/ui/TextField.tsx:18`). Should use `text-muted`.
- **Border Bypass**: `border-slate-200` (`apps/web/src/components/shell/AppShell.tsx:30`), `border-slate-300` (`apps/web/src/components/ui/TextField.tsx:12`). Should use `border-border`.
- **Accent Bypass**: `bg-teal-600` (`apps/web/src/components/ui/Button.tsx:32`), `bg-teal-700` (`apps/web/src/components/ui/Button.tsx:33`), `text-teal-600` (`apps/web/src/components/process-list/ListKindTabs.tsx:14`). Should use `bg-accent-hover` / `bg-accent-active` / `text-accent`.
- **Danger Bypass**: `bg-red-500` (`apps/web/src/components/ui/Button.tsx:38`), `bg-red-600` (`apps/web/src/components/ui/Button.tsx:39`), `text-red-600` (`apps/web/src/components/ui/TextField.tsx:22`). Should use `bg-danger-hover` / `text-danger`.
- **Inline hex bypasses**: `#0f766e` in `<ShowcaseDemo />` canvas overrides (`apps/web/src/components/showcase/ShowcaseDemo.tsx:142`). Should map to `--color-accent`.

## Conflicts & Ambiguities
- **Hover/Active States**: The token layer completely lacks states. Consequently, `hover:bg-slate-100` and `hover:bg-teal-700` are hardcoded throughout instead of using `hover:bg-surface-hover` or `hover:bg-accent-hover`.
- **Borders vs Dividers**: `border-border` is used both for form input borders (which might need higher contrast) and layout dividers (which might need lower contrast).
- **Surface Shades**: Sometimes `bg-slate-50` is used, sometimes `bg-slate-100`, often serving the exact same visual intent (a slightly off-white container).
