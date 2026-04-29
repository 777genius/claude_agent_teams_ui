const { createControllerContext } = require('./internal/context.js');
const tasks = require('./internal/tasks.js');
const kanban = require('./internal/kanban.js');
const review = require('./internal/review.js');
const messages = require('./internal/messages.js');
const processes = require('./internal/processes.js');
const maintenance = require('./internal/maintenance.js');
const crossTeam = require('./internal/crossTeam.js');
const runtime = require('./internal/runtime.js');
const workSync = require('./internal/workSync.js');
const agentBlocks = require('./internal/agentBlocks.js');

function bindModule(context, moduleApi) {
  return Object.fromEntries(
    Object.entries(moduleApi).map(([name, fn]) => [
      name,
      (...args) => fn(context, ...args),
    ])
  );
}

function createController(options) {
  const context = createControllerContext(options);

  return {
    context,
    tasks: bindModule(context, tasks),
    kanban: bindModule(context, kanban),
    review: bindModule(context, review),
    messages: bindModule(context, messages),
    processes: bindModule(context, processes),
    maintenance: bindModule(context, maintenance),
    crossTeam: bindModule(context, crossTeam),
    runtime: bindModule(context, runtime),
    workSync: bindModule(context, workSync),
  };
}

module.exports = {
  createController,
  createControllerContext,
  agentBlocks,
  protocols: {
    buildActionModeProtocolText: tasks.buildActionModeProtocolText,
    MEMBER_DELEGATE_DESCRIPTION: tasks.MEMBER_DELEGATE_DESCRIPTION,
    buildProcessProtocolText: tasks.buildProcessProtocolText,
  },
  tasks,
  kanban,
  review,
  messages,
  processes,
  maintenance,
  crossTeam,
  runtime,
  workSync,
};
