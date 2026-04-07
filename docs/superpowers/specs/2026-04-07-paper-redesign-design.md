# Paper Redesign — Frontend Design Spec

**Date:** 2026-04-07  
**Status:** Approved  
**Scope:** Frontend only — no backend, routing, or React Query changes

---

## Overview

Full visual redesign of the pi-manager frontend using the Paper aesthetic: off-white ruled-paper background, Bebas Neue display type, DM Sans body, DM Mono data, red (`#c0392b`) accent, sharp zero-radius corners, offset box shadows. Includes UX improvements (skeleton loading, empty states, `modified_at` display in file rows).

All required data is already served by the backend. No API changes needed.

---

## Design Tokens

Added to `frontend/src/index.css` as CSS custom properties on `:root`.

### Colors

| Token | Value | Usage |
|---|---|---|
| `--paper-bg` | `#f5f0e8` | Page background |
| `--paper-surface` | `#faf7f2` | Card background |
| `--paper-surface-hi` | `#ffffff` | Elevated surfaces (dialog) |
| `--paper-border` | `rgba(0,0,0,0.10)` | Default borders |
| `--paper-border-bold` | `rgba(0,0,0,0.20)` | Emphasis borders, card shadows |
| `--paper-text` | `#1a1208` | Primary text |
| `--paper-muted` | `#6b5e45` | Secondary text, labels |
| `--paper-dim` | `#c8b898` | Tertiary text, separators |
| `--paper-accent` | `#c0392b` | Interactive, active states, fill |
| `--paper-safe` | `#16a34a` | Healthy / OK states |
| `--paper-warn` | `#d97706` | Warning states (disk 70–90%) |
| `--paper-danger` | `#c0392b` | Destructive actions, disk ≥90% |

### Typography

| Token | Value | Usage |
|---|---|---|
| `--font-display` | `'Bebas Neue', sans-serif` | Headings, big numbers, section labels, nav tabs, button text |
| `--font-ui` | `'DM Sans', sans-serif` | All readable UI text: file names, descriptions, dialog body |
| `--font-data` | `'DM Mono', monospace` | Data values: sizes, timestamps, paths, stat labels/values |

Google Fonts import: `Bebas Neue`, `DM Sans` (opsz 9–40, weights 300/400/500), `DM Mono` (weights 400/500).

### Global overrides

- `border-radius: 0` everywhere (overrides Tailwind defaults via `@layer base`)
- Background: `--paper-bg` with repeating horizontal ruled-line texture: `repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(0,0,0,0.04) 31px, rgba(0,0,0,0.04) 32px)`
- Card shadow pattern: `3px 3px 0 var(--paper-border-bold)` (offset, not blurred)

---

## Section 1 — Layout & Navigation

### Header (`LayoutMain`)

- Sticky, `--paper-bg` background with ruled texture showing through
- Bottom border: `3px solid var(--paper-text)`
- Brand name: Bebas Neue 22px, uppercase, 0.08em letter-spacing, `--paper-text`
- Live badge: pulsing dot (color `--paper-safe`) + "LIVE" in DM Mono 10px, `--paper-muted`
- No logo icon

### Nav tabs

- Font: Bebas Neue 17px, uppercase, 0.06em letter-spacing
- Active: `--paper-accent` color + `3px solid var(--paper-accent)` bottom border
- Inactive: `--paper-muted`
- Container: full-width `1px solid var(--paper-border)` bottom border

---

## Section 2 — Dashboard (DiskUsageWidget + DiskUsageBar)

### DiskUsageBar

**Percentage hero**
- Bebas Neue 88px, line-height 1, `--paper-text`
- Below: "USED" in DM Mono 10px uppercase, `--paper-muted`

**Path + sync time**
- Right-aligned, DM Mono 11px, `--paper-muted`
- Sync time: DM Mono 10px, `--paper-dim`

**Progress bar**
- Height: 8px, zero border-radius
- Track: `rgba(0,0,0,0.08)`
- Fill: `--paper-accent` (red) below 70%, `--paper-warn` (amber) 70–90%, `--paper-danger` (red) ≥90%
- Animated on mount: width transitions from 0% to actual value over 1.2s `cubic-bezier(0.22, 1, 0.36, 1)`

**Stats row**
- 3-column grid (Used / Free / Total)
- Columns separated by `1px solid var(--paper-border)`
- Label: DM Mono 8px uppercase, `--paper-muted`
- Value: DM Mono 14px font-weight 500, `--paper-text`
- Zero border-radius

**Card**
- `background: var(--paper-surface)`
- `border: 1px solid var(--paper-border)`
- `box-shadow: 3px 3px 0 var(--paper-border-bold)`
- Zero border-radius

### DiskUsageWidget loading state

Skeleton: shimmer animation (`background-position` keyframe) on:
- Placeholder percentage block (80×40px)
- Placeholder bar (full-width × 8px)
- Three placeholder stat boxes

---

## Section 3 — File Browser

### FileBrowserWidget

**Breadcrumb**
- DM Mono 12px
- Ancestor segments: `--paper-accent`, cursor pointer, hover underline
- Current segment: `--paper-text`, font-weight 500
- Separator `›`: `--paper-dim`, font-size 10px
- Item count: DM Mono 10px, `--paper-dim`, right-aligned

**Empty state**
- Centered in card
- Bebas Neue 18px "EMPTY DIRECTORY", `--paper-muted`
- DM Sans 13px "No files found in this location.", `--paper-dim`

**Loading state**
- 4 skeleton rows: shimmer icon placeholder (28×28) + two shimmer lines (name + meta)

### FileRow

**Layout** — 44px min-height, `padding: 10px 14px`, hover: `background: rgba(192,57,43,0.04)`

**Icon** — 28×28px, `border: 1px solid var(--paper-border)`, zero radius
- Directory: `background: rgba(192,57,43,0.06)`, red SVG stroke
- File: transparent background, `--paper-muted` SVG stroke

**Name** — DM Sans 14px, `--paper-text`, font-weight 500

**Modified date** — DM Mono 10px, `--paper-dim`, formatted as `Apr 7` from `modified_at` Unix timestamp (currently not displayed — this is a UX improvement; field is already served by the API)

**Size** — DM Mono 12px, `--paper-muted`, right-aligned

**Action menu button** — `⋯`, opacity 0, revealed on row hover. Click shows Delete option in `--paper-danger`.

**Entrance animation** — `translateX(-8px) → 0` + `opacity 0 → 1`, staggered 50ms per row

**Parent row (`..`)** — same icon, name in `--paper-muted`, no size/date columns

---

## Section 4 — Delete Confirm Dialog

**Overlay** — `rgba(0,0,0,0.55)`, no blur

**Dialog box**
- `background: var(--paper-surface-hi)`
- `border: 1px solid var(--paper-border-bold)`
- `box-shadow: 6px 6px 0 rgba(0,0,0,0.15)`
- Zero border-radius, max-width 320px
- Entrance: `translateY(12px) scale(0.97) → translateY(0) scale(1)` over 0.2s

**Title** — Bebas Neue 20px "DELETE FILE?", `--paper-danger`

**Body** — DM Sans 13px, `--paper-muted`. Filename in `--paper-text` font-weight 500: `"<name>" will be permanently removed. This cannot be undone.`

**Buttons** — full-width, stacked, zero border-radius
- Cancel: `border: 2px solid var(--paper-border-bold)`, transparent background, `--paper-text`
- Delete: `background: var(--paper-danger)`, white text, Bebas Neue 15px uppercase. Hover: `opacity: 0.88`

**Dismiss** — Escape key + click outside overlay

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/index.css` | Paper tokens, Google Fonts import, global resets, ruled texture |
| `frontend/src/layouts/LayoutMain.tsx` | Header + nav tab styles |
| `frontend/src/features/disk-usage/components/DiskUsageBar.tsx` | Full visual rewrite |
| `frontend/src/features/disk-usage/components/DiskUsageWidget.tsx` | Skeleton loading state |
| `frontend/src/features/files/components/FileBrowserWidget.tsx` | Breadcrumb, empty state, skeleton |
| `frontend/src/features/files/components/FileRow.tsx` | Icon, layout, `modified_at` display, hover menu |
| `frontend/src/features/files/components/DeleteConfirmDialog.tsx` | Full visual rewrite |

## Files NOT Changed

- All backend code
- Router, pages, query hooks, API client
- `docker-compose.yml`, `CLAUDE.md`, build config
