<script setup lang="ts">
const { t } = useI18n()

interface CellValue {
  status: string
  note?: string
  noteLink?: string
}

interface ComparisonRow {
  feature: string
  us: CellValue
  gastown: CellValue
  paperclip: CellValue
  cursor: CellValue
  claudeCli: CellValue
}

const rows = computed<ComparisonRow[]>(() => [
  {
    feature: t('comparison.features.crossTeam'),
    us: { status: 'yes' },
    gastown: { status: 'partial', note: 'Cross-rig coordination' },
    paperclip: { status: 'partial', note: 'Company-scoped org work' },
    cursor: { status: 'na' },
    claudeCli: { status: 'no' },
  },
  {
    feature: t('comparison.features.agentMessaging'),
    us: { status: 'yes', note: 'Native real-time mailbox' },
    gastown: { status: 'yes', note: 'Mailboxes + handoffs' },
    paperclip: { status: 'partial', note: 'Comments + @mentions' },
    cursor: { status: 'no' },
    claudeCli: { status: 'yes', note: 'Team mailbox, no UI' },
  },
  {
    feature: t('comparison.features.linkedTasks'),
    us: { status: 'yes', note: 'Cross-refs + dependencies' },
    gastown: { status: 'partial', note: 'Beads deps + convoys' },
    paperclip: { status: 'yes', note: 'Goals, parents, blockers' },
    cursor: { status: 'no' },
    claudeCli: { status: 'yes', note: 'Shared task list' },
  },
  {
    feature: t('comparison.features.sessionAnalysis'),
    us: { status: 'yes', note: 'Task logs + token tracking' },
    gastown: { status: 'partial', note: 'Session recall, feed, OTEL' },
    paperclip: { status: 'partial', note: 'Run transcripts + cost audit' },
    cursor: { status: 'no' },
    claudeCli: { status: 'partial', note: 'Usage command, no UI' },
  },
  {
    feature: t('comparison.features.taskAttachments'),
    us: { status: 'yes', note: 'Auto-attach, agents read & attach' },
    gastown: { status: 'no', note: 'Not task-level' },
    paperclip: { status: 'yes', note: 'Docs, attachments, work products' },
    cursor: { status: 'partial', note: 'Chat session only' },
    claudeCli: { status: 'partial', note: 'Chat images only' },
  },
  {
    feature: t('comparison.features.hunkReview'),
    us: { status: 'yes', note: 'Accept / reject individual hunks' },
    gastown: { status: 'no' },
    paperclip: { status: 'no', note: 'Bring your own review' },
    cursor: { status: 'yes' },
    claudeCli: { status: 'no' },
  },
  {
    feature: t('comparison.features.codeEditor'),
    us: { status: 'yes', note: 'With Git support' },
    gastown: { status: 'no' },
    paperclip: { status: 'no', note: 'Control plane, not editor' },
    cursor: { status: 'yes', note: 'Full IDE' },
    claudeCli: { status: 'no' },
  },
  {
    feature: t('comparison.features.fullAutonomy'),
    us: { status: 'yes', note: 'Create, assign, review end-to-end' },
    gastown: { status: 'yes', note: 'Mayor, convoys, recovery' },
    paperclip: { status: 'yes', note: 'Heartbeats + governance' },
    cursor: { status: 'partial', note: 'Background agents, not teams' },
    claudeCli: { status: 'yes', note: 'Experimental CLI teams' },
  },
  {
    feature: t('comparison.features.taskDeps'),
    us: { status: 'yes', note: 'Guaranteed ordering' },
    gastown: { status: 'yes', note: 'DAG waves via Beads' },
    paperclip: { status: 'yes', note: 'Blockers + execution locks' },
    cursor: { status: 'no' },
    claudeCli: { status: 'yes', note: 'Team task deps, no UI' },
  },
  {
    feature: t('comparison.features.reviewWorkflow'),
    us: { status: 'yes', note: 'Agents review each other' },
    gastown: { status: 'partial', note: 'Refinery merge queue' },
    paperclip: { status: 'yes', note: 'Approvals + governance' },
    cursor: { status: 'partial', note: 'PR/BugBot only' },
    claudeCli: { status: 'yes', note: 'Team review, no UI' },
  },
  {
    feature: t('comparison.features.zeroSetup'),
    us: { status: 'yes', note: 'Guided runtime setup' },
    gastown: { status: 'no', note: 'Go/Git/Dolt/Beads/tmux' },
    paperclip: { status: 'partial', note: 'npx + embedded Postgres' },
    cursor: { status: 'yes' },
    claudeCli: { status: 'partial', note: 'CLI + env flag' },
  },
  {
    feature: t('comparison.features.kanban'),
    us: { status: 'yes', note: '5 columns, real-time' },
    gastown: { status: 'no', note: 'Dashboard, not Kanban' },
    paperclip: { status: 'yes', note: '7 columns, drag-and-drop' },
    cursor: { status: 'no' },
    claudeCli: { status: 'no' },
  },
  {
    feature: t('comparison.features.execLog'),
    us: { status: 'yes', note: 'Tool calls, reasoning, timeline' },
    gastown: { status: 'partial', note: 'Feed, OTEL, dashboard' },
    paperclip: { status: 'yes', note: 'Run transcripts + ledger' },
    cursor: { status: 'partial', note: 'Agent chat + terminal' },
    claudeCli: { status: 'no' },
  },
  {
    feature: t('comparison.features.liveProcesses'),
    us: { status: 'yes', note: 'View, stop, open URLs' },
    gastown: { status: 'partial', note: 'Agent health dashboard' },
    paperclip: { status: 'partial', note: 'Manual services + previews' },
    cursor: { status: 'partial', note: 'Native terminal only' },
    claudeCli: { status: 'no' },
  },
  {
    feature: t('comparison.features.perTaskReview'),
    us: { status: 'yes', note: 'Accept / reject / comment' },
    gastown: { status: 'partial', note: 'Merge queue, no diff UI' },
    paperclip: { status: 'partial', note: 'PR/work products, no diff UI' },
    cursor: { status: 'yes', note: 'BugBot on PRs' },
    claudeCli: { status: 'no' },
  },
  {
    feature: t('comparison.features.flexAutonomy'),
    us: { status: 'yes', note: 'Per-action approvals + notifications' },
    gastown: { status: 'yes', note: 'Gates, escalation, recovery' },
    paperclip: { status: 'yes', note: 'Board approvals, pause, terminate' },
    cursor: { status: 'partial', note: 'BG agents auto-run commands' },
    claudeCli: { status: 'yes', note: 'Permissions + hooks' },
  },
  {
    feature: t('comparison.features.worktree'),
    us: { status: 'yes', note: 'Optional' },
    gastown: { status: 'yes', note: 'Core primitive' },
    paperclip: { status: 'yes', note: 'Worktrees / branches' },
    cursor: { status: 'partial', note: 'Background branches/VMs' },
    claudeCli: { status: 'partial', note: 'Manual worktrees' },
  },
  {
    feature: t('comparison.features.multiAgent'),
    us: { status: 'yes', note: 'Claude, Codex + OpenCode teammates' },
    gastown: { status: 'yes', note: 'Claude, Codex, Gemini, Copilot + more' },
    paperclip: { status: 'yes', note: 'BYO agents: Claude, Codex, Cursor/OpenCode, HTTP' },
    cursor: { status: 'partial', note: 'Multi-model agents, no team backend' },
    claudeCli: { status: 'partial', note: 'Claude-only experimental teams' },
  },
  {
    feature: t('comparison.features.orgGovernance'),
    us: { status: 'partial', note: 'Roles + approvals, no org chart' },
    gastown: { status: 'partial', note: 'Roles + escalation' },
    paperclip: { status: 'yes', note: 'Org chart + board governance' },
    cursor: { status: 'partial', note: 'Team admin only' },
    claudeCli: { status: 'no' },
  },
  {
    feature: t('comparison.features.budgetControls'),
    us: { status: 'partial', note: 'Cost/token visibility, no hard caps' },
    gastown: { status: 'partial', note: 'Cost tiers + digest, no hard caps' },
    paperclip: { status: 'yes', note: 'Per-agent budgets + hard stops' },
    cursor: { status: 'partial', note: 'Usage + BG spend limits' },
    claudeCli: { status: 'partial', note: '/cost + workspace limits' },
  },
  {
    feature: t('comparison.features.price'),
    us: { status: 'free', note: 'OSS, provider access needed' },
    gastown: { status: 'free', note: 'OSS, runtime plans needed' },
    paperclip: { status: 'free', note: 'OSS, self-hosted + infra' },
    cursor: { status: 'text', note: 'Free + paid usage' },
    claudeCli: { status: 'text', note: 'Claude plan or API usage' },
  },
])

const competitors = [
  { key: 'us', name: 'Agent Teams', highlight: true },
  { key: 'gastown', name: 'Gastown' },
  { key: 'paperclip', name: 'Paperclip' },
  { key: 'cursor', name: 'Cursor' },
  { key: 'claudeCli', name: 'Claude Code CLI' },
]

function getCellClass(cell: CellValue): string {
  switch (cell.status) {
    case 'yes': return 'comparison-table__cell--yes'
    case 'no': return 'comparison-table__cell--no'
    case 'partial': return 'comparison-table__cell--partial'
    case 'na': return 'comparison-table__cell--na'
    case 'free': return 'comparison-table__cell--free'
    case 'soon': return 'comparison-table__cell--soon'
    case 'text': return 'comparison-table__cell--text'
    default: return 'comparison-table__cell--text'
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'yes': return '\u2713'
    case 'no': return '\u2717'
    case 'partial': return '\u25D2'
    case 'na': return 'N/A'
    case 'free': return 'Free'
    case 'soon': return '\uD83D\uDCC5'
    default: return ''
  }
}
</script>

<template>
  <section id="comparison" class="comparison-section section anchor-offset">
    <v-container>
      <div class="comparison-section__header">
        <h2 class="comparison-section__title">
          {{ t("comparison.sectionTitle") }}
        </h2>
        <p class="comparison-section__subtitle">
          {{ t("comparison.sectionSubtitle") }}
        </p>
      </div>

      <div class="comparison-table__wrap">
        <table class="comparison-table">
          <thead>
            <tr>
              <th class="comparison-table__th comparison-table__th--feature">
                {{ t("comparison.feature") }}
              </th>
              <th
                v-for="comp in competitors"
                :key="comp.key"
                class="comparison-table__th"
                :class="{ 'comparison-table__th--highlight': comp.highlight }"
              >
                {{ comp.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in rows"
              :key="index"
              class="comparison-table__row"
            >
              <td class="comparison-table__td comparison-table__td--feature">
                {{ row.feature }}
              </td>
              <td
                v-for="comp in competitors"
                :key="comp.key"
                class="comparison-table__td"
                :class="[
                  getCellClass(row[comp.key as keyof ComparisonRow] as CellValue),
                  { 'comparison-table__td--highlight-col': comp.highlight }
                ]"
              >
                <div class="comparison-table__cell-inner">
                  <span class="comparison-table__cell-content">
                    <template v-if="(row[comp.key as keyof ComparisonRow] as CellValue).status === 'text'">
                      {{ (row[comp.key as keyof ComparisonRow] as CellValue).note }}
                    </template>
                    <template v-else>
                      {{ getStatusIcon((row[comp.key as keyof ComparisonRow] as CellValue).status) }}
                    </template>
                  </span>
                  <a
                    v-if="(row[comp.key as keyof ComparisonRow] as CellValue).noteLink && (row[comp.key as keyof ComparisonRow] as CellValue).status !== 'text'"
                    :href="(row[comp.key as keyof ComparisonRow] as CellValue).noteLink"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="comparison-table__cell-note comparison-table__cell-note--link"
                  >
                    {{ (row[comp.key as keyof ComparisonRow] as CellValue).note }}
                  </a>
                  <span
                    v-else-if="(row[comp.key as keyof ComparisonRow] as CellValue).note && (row[comp.key as keyof ComparisonRow] as CellValue).status !== 'text'"
                    class="comparison-table__cell-note"
                  >
                    {{ (row[comp.key as keyof ComparisonRow] as CellValue).note }}
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </v-container>
  </section>
</template>

<style scoped>
.comparison-section {
  position: relative;
}

.comparison-section__header {
  text-align: center;
  max-width: 640px;
  margin: 0 auto 56px;
  position: relative;
  z-index: 1;
}

.comparison-section__title {
  font-size: 2.4rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin-bottom: 16px;
  background: linear-gradient(135deg, #e0e6ff 0%, #00f0ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.comparison-section__subtitle {
  font-size: 1.1rem;
  color: #8892b0;
  line-height: 1.6;
  margin: 0;
}

/* Table wrapper */
.comparison-table__wrap {
  overflow-x: clip;
  border-radius: 16px;
  border: 1px solid rgba(0, 240, 255, 0.15);
  background: rgba(10, 10, 15, 0.6);
  backdrop-filter: blur(12px);
  position: relative;
  z-index: 1;
}

.comparison-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 780px;
  font-size: 0.85rem;
}

/* Header */
.comparison-table thead {
  position: sticky;
  top: 64px;
  z-index: 2;
}

.comparison-table__th {
  padding: 16px 12px;
  text-align: center;
  font-weight: 600;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8892b0;
  border-bottom: 1px solid rgba(0, 240, 255, 0.1);
  white-space: nowrap;
  font-family: "JetBrains Mono", monospace;
  background: rgb(10, 10, 15);
}

.comparison-table__th--feature {
  text-align: left;
  padding-left: 20px;
  min-width: 180px;
}

.comparison-table__th--highlight {
  color: #00f0ff;
  background: rgba(0, 18, 20, 0.97);
  position: relative;
}

.comparison-table__th--highlight::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, #00f0ff, #39ff14);
}

/* Rows */
.comparison-table__row {
  transition: background-color 0.15s ease;
}

.comparison-table__row:hover {
  background: rgba(0, 240, 255, 0.03);
}

.comparison-table__row:not(:last-child) .comparison-table__td {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

/* Cells */
.comparison-table__td {
  padding: 10px 8px;
  text-align: center;
  vertical-align: middle;
}

.comparison-table__td--feature {
  text-align: left;
  padding-left: 20px;
  color: #e0e6ff;
  font-weight: 500;
  font-size: 0.85rem;
}

.comparison-table__td--highlight-col {
  background: rgba(0, 240, 255, 0.04);
}

.comparison-table__cell-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.comparison-table__cell-content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 700;
}

.comparison-table__cell-note {
  font-size: 0.78rem;
  color: #6b7994;
  line-height: 1.3;
  max-width: 140px;
  text-align: center;
  white-space: normal;
}

.comparison-table__cell-note--link {
  color: #00d4e6;
  text-decoration: underline;
  text-decoration-color: rgba(0, 212, 230, 0.3);
  text-underline-offset: 2px;
  transition: color 0.2s ease, text-decoration-color 0.2s ease;
}

.comparison-table__cell-note--link:hover {
  color: #00f0ff;
  text-decoration-color: rgba(0, 240, 255, 0.6);
}

/* Cell status variants */
.comparison-table__cell--yes .comparison-table__cell-content {
  color: #39ff14;
  background: rgba(57, 255, 20, 0.1);
  text-shadow: 0 0 8px rgba(57, 255, 20, 0.4);
}

.comparison-table__cell--no .comparison-table__cell-content {
  color: #ff4757;
  background: rgba(255, 71, 87, 0.08);
  opacity: 0.6;
}

.comparison-table__cell--partial .comparison-table__cell-content {
  color: #ffd700;
  background: rgba(255, 215, 0, 0.08);
}

.comparison-table__cell--na .comparison-table__cell-content {
  color: #4a5568;
  background: transparent;
}

.comparison-table__cell--soon .comparison-table__cell-content {
  width: auto;
  padding: 4px 10px;
  font-size: 0.75rem;
  color: #00f0ff;
  background: rgba(0, 240, 255, 0.08);
  font-family: "JetBrains Mono", monospace;
}

.comparison-table__cell--free .comparison-table__cell-content,
.comparison-table__cell--text .comparison-table__cell-content {
  width: auto;
  padding: 4px 10px;
  font-size: 0.75rem;
  font-family: "JetBrains Mono", monospace;
  letter-spacing: 0.04em;
}

.comparison-table__cell--free .comparison-table__cell-content {
  color: #39ff14;
  background: rgba(57, 255, 20, 0.1);
  text-shadow: 0 0 8px rgba(57, 255, 20, 0.4);
}

.comparison-table__cell--text .comparison-table__cell-content {
  color: #8892b0;
  background: rgba(255, 255, 255, 0.04);
}

/* Highlight column — our product */
.comparison-table__td--highlight-col.comparison-table__cell--yes .comparison-table__cell-content {
  box-shadow: 0 0 12px rgba(57, 255, 20, 0.2);
}

.comparison-table__td--highlight-col.comparison-table__cell--free .comparison-table__cell-content {
  box-shadow: 0 0 12px rgba(57, 255, 20, 0.2);
}

/* Light theme */
.v-theme--light .comparison-section__title {
  background: linear-gradient(135deg, #1e293b 0%, #0891b2 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.v-theme--light .comparison-section__subtitle {
  color: #475569;
}

.v-theme--light .comparison-table__wrap {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(0, 180, 200, 0.2);
}

.v-theme--light .comparison-table__th {
  color: #64748b;
  border-bottom-color: rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.95);
}

.v-theme--light .comparison-table__th--highlight {
  color: #0891b2;
  background: rgba(240, 253, 255, 0.97);
}

.v-theme--light .comparison-table__th--highlight::after {
  background: linear-gradient(90deg, #0891b2, #059669);
}

.v-theme--light .comparison-table__td--feature {
  color: #1e293b;
}

.v-theme--light .comparison-table__row:hover {
  background: rgba(8, 145, 178, 0.03);
}

.v-theme--light .comparison-table__row:not(:last-child) .comparison-table__td {
  border-bottom-color: rgba(0, 0, 0, 0.05);
}

.v-theme--light .comparison-table__td--highlight-col {
  background: rgba(8, 145, 178, 0.04);
}

.v-theme--light .comparison-table__cell-note {
  color: #94a3b8;
}

.v-theme--light .comparison-table__cell-note--link {
  color: #0891b2;
  text-decoration-color: rgba(8, 145, 178, 0.3);
}

.v-theme--light .comparison-table__cell-note--link:hover {
  color: #0e7490;
  text-decoration-color: rgba(14, 116, 144, 0.6);
}

.v-theme--light .comparison-table__cell--yes .comparison-table__cell-content {
  color: #059669;
  background: rgba(5, 150, 105, 0.1);
  text-shadow: none;
}

.v-theme--light .comparison-table__cell--no .comparison-table__cell-content {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.06);
}

.v-theme--light .comparison-table__cell--partial .comparison-table__cell-content {
  color: #d97706;
  background: rgba(217, 119, 6, 0.08);
}

.v-theme--light .comparison-table__cell--free .comparison-table__cell-content {
  color: #059669;
  background: rgba(5, 150, 105, 0.1);
  text-shadow: none;
}

.v-theme--light .comparison-table__cell--soon .comparison-table__cell-content {
  color: #0891b2;
  background: rgba(8, 145, 178, 0.08);
}

.v-theme--light .comparison-table__cell--text .comparison-table__cell-content {
  color: #64748b;
  background: rgba(0, 0, 0, 0.04);
}

/* Responsive */
@media (max-width: 960px) {
  .comparison-table__wrap {
    overflow-x: auto;
  }

  .comparison-section__title {
    font-size: 1.85rem;
  }

  .comparison-section__header {
    margin-bottom: 40px;
  }

  .comparison-section__subtitle {
    font-size: 1rem;
  }
}

@media (max-width: 600px) {
  .comparison-section__title {
    font-size: 1.6rem;
  }

  .comparison-section__header {
    margin-bottom: 32px;
  }

  .comparison-table {
    font-size: 0.8rem;
  }

  .comparison-table__th {
    padding: 12px 8px;
    font-size: 0.7rem;
  }

  .comparison-table__td {
    padding: 8px 6px;
  }

  .comparison-table__td--feature {
    padding-left: 14px;
    font-size: 0.8rem;
  }

  .comparison-table__cell-note {
    font-size: 0.7rem;
    max-width: 110px;
  }
}
</style>
