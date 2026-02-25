---
globs: ["src/renderer/**/*.tsx"]
---

# React Conventions

## Component Structure
- Components in `src/renderer/components/` organized by feature
- One component per file, PascalCase naming
- Colocate related hooks and utilities

## State Management (Zustand)
```typescript
// Slices pattern
projects: Project[]
selectedProjectId: string | null
projectsLoading: boolean
projectsError: string | null
```

Each domain slice includes:
- Data array or object
- Selected/active item ID
- Loading state
- Error state

## Hooks
- Custom hooks in `src/renderer/hooks/`
- Prefix with `use`: `useAutoScrollBottom`, `useTheme`
- Keep hooks focused and composable

## Component Organization
```
components/
├── chat/           # Chat display, items, viewers, SessionContextPanel
├── common/         # Shared components (badges, token display)
├── dashboard/      # Dashboard views
├── layout/         # Layout components (headers, shells)
├── notifications/  # Notification panels and badges
├── search/         # Search UI and results
├── settings/       # Settings pages and controls
│   ├── components/ # Reusable setting controls
│   ├── hooks/      # Settings-specific hooks
│   ├── sections/   # Setting sections
│   └── NotificationTriggerSettings/  # Trigger config UI
└── sidebar/        # Sidebar navigation
```

## Data Access: Store over Props
When data is available in the Zustand store, child components should read it directly via `useStore()` instead of receiving it through props. This avoids unnecessary prop drilling and keeps parent components clean.

```tsx
// Preferred — child reads from store
const ProcessesSection = () => {
  const teamName = useStore((s) => s.selectedTeamName);
  const data = useStore((s) => s.selectedTeamData);
  // ...
};

// Avoid — parent drills store data as props
<ProcessesSection teamName={teamName} processes={data.processes} members={data.members} />
```

Only pass props when the data is NOT in the store (e.g. local state, computed values, callbacks).

## Contexts
- `contexts/TabUIContext.tsx` - Per-tab UI state isolation
