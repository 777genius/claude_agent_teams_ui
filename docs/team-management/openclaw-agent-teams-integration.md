# OpenClaw Integration With Agent Teams

**Status:** Local-first integration guide  
**Audience:** OpenClaw or any external AI client that can call MCP tools or local HTTP APIs  
**Primary use case:** Let an outside AI create, inspect, launch, and coordinate Agent Teams for complex work and cross-checking

## 1. Short Answer

Yes, this is feasible.

The integration has two layers:

1. **Agent Teams Desktop App HTTP control API**
   - Runs locally on the same machine as the desktop app.
   - Defaults to `http://127.0.0.1:3456`.
   - Exposes REST endpoints for teams and runtime lifecycle.

2. **`agent-teams-mcp` stdio MCP server**
   - Does not listen on a port.
   - Is started by each MCP client as a normal child process.
   - Forwards runtime/team operations to the local HTTP control API.

For OpenClaw, the preferred path is:

```text
OpenClaw -> stdio MCP process: agent-teams-mcp -> local Agent Teams HTTP API -> Desktop runtime
```

Direct REST is also possible:

```text
OpenClaw -> http://127.0.0.1:3456/api/... -> Desktop runtime
```

## 2. Important Architecture Notes

### 2.1 Multiple MCP Processes Are Expected

It is safe for multiple agents and OpenClaw to each start their own `agent-teams-mcp` process.

This works because `agent-teams-mcp` uses **stdio transport**:

- it does not bind a TCP port;
- it does not own team state;
- it does not create a separate control plane;
- it reads/writes through the shared Agent Teams runtime and shared Claude data directory.

Example:

```text
Agent 1 MCP process \
Agent 2 MCP process  -> Agent Teams Desktop HTTP API -> shared teams/tasks/runtime
OpenClaw MCP process/
```

The MCP processes are many. The control plane is one.

### 2.2 The MCP Server Has No URL

Do not look for an MCP URL.

`agent-teams-mcp` is launched by the MCP client:

```text
client starts process -> client speaks JSON-RPC over stdin/stdout
```

The URL belongs to the desktop app HTTP control API, not to MCP.

### 2.3 The HTTP Control API Is Localhost Only

The desktop HTTP server binds to `127.0.0.1` by default.

Default base URL:

```text
http://127.0.0.1:3456
```

If port `3456` is busy, the app tries the next ports.

The current URL is published to:

```text
~/.claude/team-control-api.json
```

Example:

```json
{
  "baseUrl": "http://127.0.0.1:3456",
  "pid": 12345,
  "updatedAt": "2026-04-29T10:00:00.000Z"
}
```

### 2.4 Remote OpenClaw Needs a Tunnel

If OpenClaw runs on the same Mac as the desktop app, no tunnel is needed.

If OpenClaw runs on another server, it cannot directly reach `127.0.0.1` on the Mac. Use one of:

- SSH tunnel;
- reverse tunnel;
- VPN;
- a future authenticated remote control endpoint.

Do not expose the local HTTP API to the public internet without authentication and transport security.

## 3. Prerequisites

1. Agent Teams desktop app is running.
2. HTTP server is enabled in Agent Teams settings.
3. OpenClaw runs on the same machine, or has a secure tunnel to the machine.
4. Node.js 20+ is available if OpenClaw will launch the MCP server from source or build output.

To confirm the HTTP control API is available:

```bash
cat ~/.claude/team-control-api.json
curl -s http://127.0.0.1:3456/api/teams
```

If the app selected a different port, use the `baseUrl` from `team-control-api.json`.

## 4. Recommended Integration: MCP

Use MCP if OpenClaw supports external MCP servers. MCP gives OpenClaw a tool surface instead of forcing it to hand-roll REST calls.

### 4.1 Dev Workspace MCP Config

When running from this repository:

```json
{
  "mcpServers": {
    "agent-teams": {
      "command": "pnpm",
      "args": ["--dir", "/Users/belief/dev/projects/claude/claude_team/mcp-server", "dev"],
      "env": {
        "AGENT_TEAMS_MCP_CLAUDE_DIR": "/Users/belief/.claude",
        "CLAUDE_TEAM_CONTROL_URL": "http://127.0.0.1:3456"
      }
    }
  }
}
```

Notes:

- Adjust the paths for the user's machine.
- `AGENT_TEAMS_MCP_CLAUDE_DIR` tells MCP which Claude data directory to use.
- `CLAUDE_TEAM_CONTROL_URL` is optional if `~/.claude/team-control-api.json` exists, but it is useful for explicit setup.
- If the HTTP server is on another port, update `CLAUDE_TEAM_CONTROL_URL`.

### 4.2 Built MCP Config

For a built MCP server:

```bash
pnpm --filter agent-teams-mcp build
```

Then configure OpenClaw like:

```json
{
  "mcpServers": {
    "agent-teams": {
      "command": "node",
      "args": ["/Users/belief/dev/projects/claude/claude_team/mcp-server/dist/index.js"],
      "env": {
        "AGENT_TEAMS_MCP_CLAUDE_DIR": "/Users/belief/.claude",
        "CLAUDE_TEAM_CONTROL_URL": "http://127.0.0.1:3456"
      }
    }
  }
}
```

### 4.3 Packaged App Config

In a packaged app, the app resolves its bundled MCP entrypoint internally for teams it launches. For an external client like OpenClaw, give it either:

- the packaged `agent-teams-mcp/dist/index.js` path, if available;
- or a separately installed copy of `agent-teams-mcp`;
- or a dev checkout path while testing.

The MCP client still starts it as a stdio process.

## 5. MCP Tool Flow Examples

The exact UI for tool calls depends on OpenClaw, but the calls are conceptually:

### 5.1 List Teams

Tool:

```text
team_list
```

Arguments:

```json
{
  "controlUrl": "http://127.0.0.1:3456"
}
```

`controlUrl` can be omitted if `~/.claude/team-control-api.json` is available.

### 5.2 Create a Draft Team

Tool:

```text
team_create
```

Arguments:

```json
{
  "teamName": "openclaw-review",
  "displayName": "OpenClaw Review",
  "description": "Team used by OpenClaw to cross-check complex work",
  "cwd": "/Users/belief/dev/projects/example-project",
  "providerId": "codex",
  "providerBackendId": "codex-native",
  "model": "gpt-5.4",
  "effort": "high",
  "fastMode": "inherit",
  "limitContext": true,
  "skipPermissions": false,
  "members": [
    {
      "name": "reviewer",
      "role": "Reviewer",
      "workflow": "Review OpenClaw's work for bugs, missing tests, incorrect assumptions, and integration risks.",
      "providerId": "codex",
      "providerBackendId": "codex-native",
      "model": "gpt-5.4",
      "effort": "high",
      "fastMode": "inherit"
    },
    {
      "name": "critic",
      "role": "Critical reviewer",
      "workflow": "Look for edge cases, concurrency issues, unsafe assumptions, and architectural regressions.",
      "providerId": "anthropic",
      "model": "claude-opus-4-6",
      "effort": "high"
    }
  ]
}
```

This creates a **draft** team. It does not launch the runtime yet.

### 5.3 Inspect a Team

Tool:

```text
team_get
```

Arguments:

```json
{
  "teamName": "openclaw-review"
}
```

For a draft team, the response includes draft/saved request data. For a launched/configured team, it returns the team snapshot.

### 5.4 Launch a Team

Tool:

```text
team_launch
```

Arguments:

```json
{
  "teamName": "openclaw-review",
  "cwd": "/Users/belief/dev/projects/example-project",
  "prompt": "Cross-check OpenClaw's latest changes. Focus on regressions, missing tests, and risky assumptions. Report actionable findings.",
  "waitForReady": true,
  "waitTimeoutMs": 180000
}
```

`team_launch` works for:

- a draft team created by `team_create`;
- an existing configured team already known to Agent Teams.

### 5.5 Stop a Team

Tool:

```text
team_stop
```

Arguments:

```json
{
  "teamName": "openclaw-review",
  "waitForStop": true
}
```

## 6. Suggested OpenClaw Policy

OpenClaw can use Agent Teams only for work that benefits from parallel review or specialized team behavior.

Suggested routing:

1. For small edits, OpenClaw works alone.
2. For risky changes, OpenClaw calls `team_create` if the review team does not exist.
3. OpenClaw calls `team_launch` with a focused review prompt.
4. OpenClaw waits for team readiness.
5. OpenClaw uses the existing MCP board/message tools to create tasks or collect results, if needed.
6. OpenClaw treats Agent Teams feedback as review input, not as automatically trusted output.

Example instruction for OpenClaw:

```text
When the task is complex, high-risk, or needs cross-checking, use the agent-teams MCP server.

Prefer reusing an existing team named "openclaw-review".
If it does not exist, create it with team_create.
Launch it with team_launch and a focused review prompt.
Use team_get to inspect team state.
Do not create duplicate teams with the same purpose.
Do not expose the local control API outside localhost unless the user explicitly configured a secure tunnel.
```

## 7. Direct REST API Integration

Use REST if OpenClaw cannot use MCP, or if you want a very small integration without MCP tool registration.

Base URL:

```text
http://127.0.0.1:3456
```

Discover the current base URL:

```bash
cat ~/.claude/team-control-api.json
```

### 7.1 REST Endpoint Summary

| Method | Path                             | Purpose                           |
| ------ | -------------------------------- | --------------------------------- |
| `GET`  | `/api/teams`                     | List teams                        |
| `POST` | `/api/teams`                     | Create a draft team configuration |
| `GET`  | `/api/teams/:teamName`           | Get a draft or configured team    |
| `POST` | `/api/teams/:teamName/launch`    | Launch a draft or configured team |
| `POST` | `/api/teams/:teamName/stop`      | Stop a running team               |
| `GET`  | `/api/teams/:teamName/runtime`   | Get runtime state for one team    |
| `GET`  | `/api/teams/provisioning/:runId` | Poll launch/provisioning status   |
| `GET`  | `/api/teams/runtime/alive`       | List alive team runtime states    |

Advanced OpenCode runtime bridge endpoints also exist:

| Method | Path                                                      |
| ------ | --------------------------------------------------------- |
| `POST` | `/api/teams/:teamName/opencode/runtime/bootstrap-checkin` |
| `POST` | `/api/teams/:teamName/opencode/runtime/deliver-message`   |
| `POST` | `/api/teams/:teamName/opencode/runtime/task-event`        |
| `POST` | `/api/teams/:teamName/opencode/runtime/heartbeat`         |

Most OpenClaw integrations should not need the OpenCode runtime bridge endpoints.

### 7.2 List Teams

```bash
curl -s http://127.0.0.1:3456/api/teams | jq .
```

### 7.3 Create a Draft Team

```bash
curl -s \
  -X POST http://127.0.0.1:3456/api/teams \
  -H 'content-type: application/json' \
  -d '{
    "teamName": "openclaw-review",
    "displayName": "OpenClaw Review",
    "description": "Team used by OpenClaw to cross-check complex work",
    "cwd": "/Users/belief/dev/projects/example-project",
    "providerId": "codex",
    "providerBackendId": "codex-native",
    "model": "gpt-5.4",
    "effort": "high",
    "fastMode": "inherit",
    "limitContext": true,
    "skipPermissions": false,
    "members": [
      {
        "name": "reviewer",
        "role": "Reviewer",
        "workflow": "Review OpenClaw work for correctness, regressions, and missing tests.",
        "providerId": "codex",
        "providerBackendId": "codex-native",
        "model": "gpt-5.4",
        "effort": "high"
      }
    ]
  }' | jq .
```

Expected response:

```json
{
  "teamName": "openclaw-review"
}
```

### 7.4 Get a Draft or Existing Team

```bash
curl -s http://127.0.0.1:3456/api/teams/openclaw-review | jq .
```

Draft response shape:

```json
{
  "teamName": "openclaw-review",
  "pendingCreate": true,
  "savedRequest": {
    "teamName": "openclaw-review",
    "cwd": "/Users/belief/dev/projects/example-project",
    "members": []
  }
}
```

Configured team response shape is the normal Agent Teams team data snapshot.

### 7.5 Launch a Team

```bash
curl -s \
  -X POST http://127.0.0.1:3456/api/teams/openclaw-review/launch \
  -H 'content-type: application/json' \
  -d '{
    "cwd": "/Users/belief/dev/projects/example-project",
    "prompt": "Cross-check OpenClaw latest work. Focus on bugs, missing tests, and architectural risks.",
    "providerId": "codex",
    "providerBackendId": "codex-native",
    "model": "gpt-5.4",
    "effort": "high",
    "fastMode": "inherit",
    "limitContext": true,
    "skipPermissions": false
  }' | jq .
```

Expected response:

```json
{
  "runId": "..."
}
```

### 7.6 Poll Launch Status

```bash
RUN_ID="paste-run-id-here"
curl -s "http://127.0.0.1:3456/api/teams/provisioning/$RUN_ID" | jq .
```

Ready states:

- `ready`
- `failed`
- `disconnected`
- `cancelled`

A successful launch reaches:

```json
{
  "state": "ready"
}
```

### 7.7 Get Runtime State

```bash
curl -s http://127.0.0.1:3456/api/teams/openclaw-review/runtime | jq .
```

### 7.8 Stop a Team

```bash
curl -s \
  -X POST http://127.0.0.1:3456/api/teams/openclaw-review/stop \
  -H 'content-type: application/json' \
  -d '{}' | jq .
```

## 8. JavaScript REST Client Example

This is a minimal OpenClaw-side helper.

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function getAgentTeamsBaseUrl() {
  if (process.env.CLAUDE_TEAM_CONTROL_URL) {
    return process.env.CLAUDE_TEAM_CONTROL_URL;
  }

  const statePath = path.join(os.homedir(), '.claude', 'team-control-api.json');
  const raw = await fs.readFile(statePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.baseUrl) {
    throw new Error('team-control-api.json does not contain baseUrl');
  }
  return parsed.baseUrl;
}

async function requestJson(pathname, options = {}) {
  const baseUrl = await getAgentTeamsBaseUrl();
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? 'GET',
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `${response.status} ${response.statusText}`);
  }
  return payload;
}

export async function ensureReviewTeam() {
  const teamName = 'openclaw-review';

  try {
    return await requestJson(`/api/teams/${teamName}`);
  } catch (error) {
    if (!String(error.message).includes('not found')) {
      throw error;
    }
  }

  await requestJson('/api/teams', {
    method: 'POST',
    body: {
      teamName,
      displayName: 'OpenClaw Review',
      cwd: process.cwd(),
      providerId: 'codex',
      providerBackendId: 'codex-native',
      model: 'gpt-5.4',
      effort: 'high',
      members: [
        {
          name: 'reviewer',
          role: 'Reviewer',
          workflow: 'Cross-check OpenClaw work for bugs, missing tests, and risky assumptions.',
          providerId: 'codex',
          providerBackendId: 'codex-native',
          model: 'gpt-5.4',
          effort: 'high',
        },
      ],
    },
  });

  return requestJson(`/api/teams/${teamName}`);
}

export async function launchReviewTeam(prompt) {
  const teamName = 'openclaw-review';
  await ensureReviewTeam();
  const launch = await requestJson(`/api/teams/${teamName}/launch`, {
    method: 'POST',
    body: {
      cwd: process.cwd(),
      prompt,
      providerId: 'codex',
      providerBackendId: 'codex-native',
      model: 'gpt-5.4',
      effort: 'high',
      skipPermissions: false,
    },
  });
  return launch;
}
```

## 9. Validation and Error Behavior

### 9.1 Team Names

Team names must be kebab-case:

```text
[a-z0-9-], max 64 chars
```

Good:

```text
openclaw-review
repo-audit-1
security-check
```

Bad:

```text
OpenClaw Review
openclaw_review
review team
```

### 9.2 Member Names

Member names are validated by Agent Teams.

Avoid reserved names:

- `user`
- `team-lead`

Use simple names:

```text
reviewer
critic
tester
architect
```

### 9.3 Common HTTP Status Codes

| Status | Meaning                                                             |
| ------ | ------------------------------------------------------------------- |
| `400`  | Invalid request payload                                             |
| `404`  | Team or run id not found                                            |
| `409`  | Conflict, for example team already exists or stale runtime evidence |
| `501`  | Team control service is not available in this mode                  |
| `500`  | Unexpected server/runtime error                                     |

## 10. Recommended Choice

### Option A: MCP-first integration

Confidence: `9/10`. Reliability: `8/10`. Complexity: `4/10`. Roughly `20-60 LOC` of OpenClaw config/glue.

Use this when OpenClaw supports MCP. It is the cleanest integration because OpenClaw sees tools like `team_create`, `team_get`, and `team_launch`.

Pros:

- idiomatic for AI clients;
- no custom HTTP client needed;
- multiple MCP processes are safe;
- automatically uses the same team/task tool surface that Agent Teams already gives agents.

Cons:

- OpenClaw must support stdio MCP servers;
- debugging involves MCP logs plus desktop logs.

### Option B: REST-first integration

Confidence: `8/10`. Reliability: `7/10`. Complexity: `5/10`. Roughly `80-180 LOC` of OpenClaw code.

Use this when OpenClaw does not support MCP or when you want direct lifecycle control.

Pros:

- easy to call from any language;
- simple to debug with curl;
- no MCP client integration needed.

Cons:

- only exposes HTTP routes currently implemented;
- OpenClaw must implement retries/polling;
- task/message/board workflows are richer through MCP.

### Option C: Hybrid MCP + REST

Confidence: `8/10`. Reliability: `8/10`. Complexity: `7/10`. Roughly `120-260 LOC`.

Use MCP for normal AI tool calls and REST for health checks, diagnostics, or non-agent automation.

Pros:

- best operational visibility;
- can recover from MCP-client-specific issues;
- useful for dashboards or service wrappers.

Cons:

- more moving parts;
- more integration surface to test.

Recommended starting point: **Option A, MCP-first**.

## 11. Troubleshooting

### MCP tool says the control API is unavailable

Check:

```bash
cat ~/.claude/team-control-api.json
curl -s http://127.0.0.1:3456/api/teams
```

Fix:

- start the Agent Teams desktop app;
- enable the HTTP server in settings;
- pass `CLAUDE_TEAM_CONTROL_URL` explicitly in OpenClaw MCP config.

### OpenClaw starts MCP, but tool calls fail

Possible causes:

- wrong `AGENT_TEAMS_MCP_CLAUDE_DIR`;
- desktop app is using a different Claude root;
- HTTP server is disabled;
- port changed because `3456` was busy;
- OpenClaw runs on another machine without a tunnel.

### `team_create` returns conflict

The team already exists. Use `team_get` and either reuse it or choose a new name.

### `team_launch` hangs or times out

Check provisioning status:

```bash
curl -s http://127.0.0.1:3456/api/teams/provisioning/<runId> | jq .
```

Possible causes:

- model/provider unavailable;
- runtime auth missing;
- working directory is invalid;
- app-side provisioning failed;
- team is already in a conflicting runtime state.

### Remote OpenClaw cannot connect

This is expected if it is not on the same machine. The API is local-only by default.

Use an SSH tunnel, for example:

```bash
ssh -N -L 3456:127.0.0.1:3456 user@mac-mini-host
```

Then OpenClaw can use:

```text
http://127.0.0.1:3456
```

from its own machine if the tunnel is established there.

## 12. Security Notes

- The current control API is intended for local use.
- It should not be bound to public interfaces without authentication.
- Prefer SSH tunnels for remote access.
- Treat access to the control API as access to team runtime control.
- Do not share `~/.claude` with untrusted processes.

## 13. Summary for the Original Request

The requested integration is realistic:

- OpenClaw can call Agent Teams through MCP.
- OpenClaw can also call the local REST API directly.
- Each agent/OpenClaw can run its own stdio MCP process.
- Those MCP processes do not conflict because they do not bind ports.
- The single shared control point is the Agent Teams desktop HTTP API.
- For local Mac mini usage, this is the right initial architecture.
