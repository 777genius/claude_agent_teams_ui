# feat: add Spanish (es) internationalization support

## Summary

- Integrate `react-i18next` internationalization framework across the entire renderer
- Migrate 174 component files from hardcoded English strings to `t()` translation calls
- Add complete Spanish (es) locale with 2,523 translated keys in full parity with English (en)
- Include a language selector in General Settings for runtime language switching

## What changed

### i18n infrastructure (`src/renderer/i18n/`)

- **`index.ts`** — Initialize i18next with `LanguageDetector`, `react-i18next`, English and Spanish resources. Falls back to `en` when a key is missing in the active locale.
- **`locales/en.json`** (3,101 lines) — Complete English locale covering all UI surfaces
- **`locales/es.json`** (3,101 lines) — Complete Spanish locale, 1:1 key parity with `en.json`

### Components migrated (174 files)

Every user-facing component now uses `useTranslation()` from `react-i18next`. The migration covers:

| Area | Files | Key namespaces |
|------|-------|----------------|
| **Team dialogs** | CreateTeamDialog, LaunchTeamDialog, TaskDetailDialog, CreateTaskDialog, SendMessageDialog, EditTeamDialog, ReviewDialog, AddMemberDialog, AdvancedCliSection, EffortLevelSelector, LimitContextCheckbox, OptionalSettingsSection, ProjectPathSelector, SkipPermissionsCheckbox, TeamModelSelector, StatusHistoryTimeline, TaskCommentInput, TaskCommentsSection, ToolApprovalSettingsPanel | `dialogs.*`, `launchTeam.*` |
| **Kanban board** | KanbanBoard, KanbanTaskCard, KanbanFilterPopover, KanbanSearchInput, KanbanSortPopover, TrashDialog | `kanban.*` |
| **Team views** | TeamListView, TeamDetailView, TeamEmptyState, ProcessesSection, TeamSessionsSection, ClaudeLogsPanel, ProvisioningProgressBlock | `teamList.*`, `team.*` |
| **Members** | MemberCard, MemberDetailDialog, MemberDetailStats, MemberDraftRow, MemberList, MembersEditorSection, MemberExecutionLog, MemberLogsTab, MemberStatsTab | `members.*` |
| **Activity** | ActivityItem, ActivityTimeline, ActiveTasksBlock, PendingRepliesBlock, ReplyQuoteBlock, ThoughtBodyContent, LeadThoughtsGroup, MessageExpandDialog | `activity.*` |
| **Messages** | MessageComposer, MessagesPanel, MessagesFilterPopover, ActionModeSelector | `messages.*` |
| **Review / Diff** | ChangeReviewDialog, ReviewDiffContent, ReviewToolbar, ReviewFileTree, FileSectionDiff, FileSectionHeader, ScopeWarningBanner, ConfidenceBadge, ConflictDialog, KeyboardShortcutsHelp | `review.*` |
| **Editor** | EditorFileTree, EditorSearchPanel, EditorStatusBar, EditorEmptyState, EditorContextMenu, EditorShortcutsHelp, QuickOpenDialog, SearchInFilesPanel, ProjectEditorOverlay | `editor.*` |
| **Settings** | SettingsView, GeneralSection, NotificationsSection, ConnectionSection, WorkspaceSection, AdvancedSection, CliStatusSection, NotificationTriggerSettings (6 sub-components) | `settings.*` |
| **Report** | SessionReportTab, OverviewSection, TokenSection, CostSection, GitSection, ToolSection, SubagentSection, ErrorSection, FrictionSection, QualitySection, InsightsSection, TimelineSection, KeyTakeawaysSection | `report.*` |
| **Extensions** | McpServersPanel, McpServerCard, McpServerDetailDialog, CustomMcpServerDialog, PluginsPanel, PluginDetailDialog, SkillsPanel, SkillDetailDialog, SkillEditorDialog, SkillImportDialog, SkillReviewDialog, ApiKeysPanel, ApiKeyCard, ApiKeyFormDialog, ExtensionStoreView, InstallButton | `extensions.*` |
| **Layout** | Sidebar, TabBar, TabBarActions, TabBarRow, TabContextMenu, SortableTab, CustomTitleBar, MoreMenu, PaneView, TeamTabSectionNav | `layout.*` |
| **Chat** | ChatHistory, ChatHistoryEmptyState, ContextBadge, DisplayItemList, SessionContextPanel, MetricsPill, SubagentItem, DiffViewer, MarkdownViewer | `chat.*` |
| **Sidebar** | DateGroupedSessions, SessionItem, GlobalTaskList, SidebarTaskItem, TaskContextMenu, TaskFiltersPopover | `sidebar.*` |
| **Common** | ConfirmDialog, TokenUsageDisplay, UpdateBanner, ContextSwitchOverlay | `common.*` |
| **Dashboard** | DashboardView, CliStatusBanner, DashboardUpdateBanner | `dashboard.*` |
| **Schedules** | SchedulesView, CronScheduleInput, ScheduleEmptyState, ScheduleRunLogDialog, ScheduleSection | `schedules.*` |
| **Search** | CommandPalette, SearchBar | `search.*` |
| **Notifications** | NotificationsView, NotificationRow | `notifications.*` |
| **Terminal** | TerminalModal | `terminal.*` |

### Pattern used

```tsx
import { useTranslation } from 'react-i18next';

const MyComponent = () => {
  const { t } = useTranslation();
  return <h1>{t('namespace.key')}</h1>;
};
```

- Interpolation: `t('key', { variable: value })` for dynamic strings
- Sub-components within the same file get their own `const { t } = useTranslation()` call
- Variable shadowing avoided: filter callbacks using `t` as parameter renamed to `tr`

### Bonus: black screen fix

Fixed a critical rendering issue where the app would show a black screen on startup due to the i18n initialization not completing before React renders. The `I18nextProvider` wrapper and `Suspense` fallback ensure proper loading sequence.

## How to test

1. **Switch to Spanish:**
   - Open Settings > General > Language and select "Español"
   - Or edit `src/renderer/i18n/index.ts` and set `lng: 'es'`
   - The entire UI should render in Spanish

2. **Switch to English:**
   - Select "English" in Settings > General > Language
   - Or set `lng: 'en'` in `index.ts`

3. **Verify key parity:**
   ```bash
   node -e '
     const en = require("./src/renderer/i18n/locales/en.json");
     const es = require("./src/renderer/i18n/locales/es.json");
     function f(o,p){p=p||"";var k={};for(var x of Object.keys(o)){var fp=p?p+"."+x:x;if(typeof o[x]==="object"&&o[x]!==null&&!Array.isArray(o[x]))Object.assign(k,f(o[x],fp));else k[fp]=o[x]}return k}
     var enK=Object.keys(f(en)), esK=Object.keys(f(es));
     var missing=enK.filter(k=>!f(es)[k]);
     console.log("en:", enK.length, "es:", esK.length, "missing:", missing.length);
   '
   ```
   Expected: `en: 2523 es: 2523 missing: 0`

4. **Spot-check critical flows:**
   - Create Team dialog (all labels, validation errors, tooltips)
   - Launch Team dialog (CLI status messages, optional settings)
   - Kanban board (column headers, card actions, filters)
   - Settings page (all tabs and sections)
   - Task detail dialog (all fields, comments, attachments)
   - Review diff view (toolbar, accept/reject actions)

## Dependencies added

- `react-i18next` — React bindings for i18next
- `i18next` — Core internationalization framework
- `i18next-browser-languagedetector` — Auto-detect browser/system language

## Notes

- Brand names (Claude, Anthropic, GitHub) and technical terms (Worktree, HTTP/SSE, CLAUDE.md) are intentionally kept in English in the Spanish locale
- The `_source` metadata keys in locale files are path references for tooling and are language-agnostic
- Adding a new language requires only creating a new `locales/{lang}.json` file and registering it in `i18n/index.ts`
