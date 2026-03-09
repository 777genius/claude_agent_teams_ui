// Cross-team message protocol constants.
// Mirror of src/shared/constants/crossTeam.ts — keep in sync.

const CROSS_TEAM_PREFIX_TAG = 'Cross-team from';
const CROSS_TEAM_SOURCE = 'cross_team';
const CROSS_TEAM_SENT_SOURCE = 'cross_team_sent';

function formatCrossTeamPrefix(from, chainDepth, meta) {
  const parts = [`${CROSS_TEAM_PREFIX_TAG} ${from}`, `depth:${chainDepth}`];
  if (meta && meta.conversationId) {
    parts.push(`conversation:${meta.conversationId}`);
  }
  if (meta && meta.replyToConversationId) {
    parts.push(`replyTo:${meta.replyToConversationId}`);
  }
  return `[${parts.join(' | ')}]`;
}

function formatCrossTeamText(from, chainDepth, text, meta) {
  return `${formatCrossTeamPrefix(from, chainDepth, meta)}\n${text}`;
}

module.exports = {
  CROSS_TEAM_PREFIX_TAG,
  CROSS_TEAM_SOURCE,
  CROSS_TEAM_SENT_SOURCE,
  formatCrossTeamPrefix,
  formatCrossTeamText,
};
