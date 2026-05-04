# Troubleshooting

Most team issues fall into one of four buckets: runtime setup, launch confirmation, task parsing, or provider limits.

## Team does not launch

Check:

- the selected runtime is installed or authenticated
- the runtime is available in the environment PATH
- the provider has access to the requested model
- the project path exists and is readable

If OpenCode shows `registered` but bootstrap is unconfirmed, inspect launch logs before changing team prompts.

## Agent replies are missing

Open task logs and teammate messages. Missing replies often come from runtime delivery, parsing, or task filtering issues. Do not assume the model ignored the message until logs confirm it.

## Tasks are not linked to changes

Use task-specific logs and code review links. If a diff appears detached, check whether the task id or task reference was included in the agent output.

## Rate limits

If a provider reports a known reset time, Agent Teams can nudge the lead to continue after cooldown. If reset time is unknown, wait or switch provider/runtime path.

## When to collect evidence

Collect:

- task id
- team name
- runtime path
- launch log excerpt
- provider/model
- exact time window

This is enough to debug most launch and task lifecycle issues.

