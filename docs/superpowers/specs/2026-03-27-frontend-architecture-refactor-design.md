# Frontend Architecture Refactor Design

**Date:** 2026-03-27
**Goal:** Refactor the frontend to follow the dashboard architecture rules:
- Components own their data fetching and handle their own loading/error states
- Pages are composed exclusively of layouts and components — no raw HTML
- Layouts handle structural alignment only

---

## Rules Being Enforced

1. Components fetch their own data; a failing widget must not block the page
2. Pages contain only layouts and components — zero raw HTML elements
3. Layouts may contain base HTML but no business logic
4. Only named exports — no `export default` anywhere in the codebase

---

## Changes

### New: `features/disk-usage/ui/DiskUsageWidget.tsx`

Self-contained widget that owns the `useDiskUsage` call. Renders its own loading spinner and error message internally, and delegates to `DiskUsageBar` on success. Takes no props.

### New: `features/disk-usage/ui/DiskUsageWidget.tests.tsx`

Tests for the three widget states: loading, error, and successful render (verifies `DiskUsageBar` receives correct data).

### New: `layouts/LayoutDashboard.tsx`

Extracts the `flex flex-col gap-6` wrapper currently inside `PageDashboard`. Accepts `children` and applies the column layout. No business logic.

### New: `shared/ui/PageHeading.tsx`

Reusable component wrapping `<h1>` with consistent styling. Accepts `children`.

### Modified: `pages/dashboard/PageDashboard.tsx`

Reduced to composing `LayoutDashboard`, `PageHeading`, and `DiskUsageWidget`. No data fetching, no HTML elements, no state.

```tsx
export function PageDashboard() {
  return (
    <LayoutDashboard>
      <PageHeading>Dashboard</PageHeading>
      <DiskUsageWidget />
    </LayoutDashboard>
  )
}
```

### Modified: `pages/dashboard/PageDashboard.tests.tsx`

Tests verify that the page renders without crashing and that the expected components are present. No longer mocks `useDiskUsage` — that concern belongs to `DiskUsageWidget.tests.tsx`.

### Modified: `features/disk-usage/index.ts`

Add `DiskUsageWidget` to barrel exports.

---

### Modified: `features/disk-usage/ui/DiskUsageBar.tsx`

Convert `export default` to named export. Tests updated to match.

### Modified: `app/providers/QueryProvider.tsx`

Convert `export default` to named export.

### Modified: `layouts/LayoutMain.tsx`

Convert `export default` to named export. Update import in `app/router.tsx`.

---

## Unchanged

- `DiskUsageBar.tests.tsx` — logic unchanged, import updated if needed
- All `api/` and `queries/` files
- `shared/api/client.ts`
