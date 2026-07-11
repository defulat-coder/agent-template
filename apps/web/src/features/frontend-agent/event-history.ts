import {
  appendCompactedAgentRunEvent,
  type AgentRunEvent,
} from "@agent-template/shared";

export const maxAgentEventHistory = 500;

export function appendAgentEventHistory(
  events: AgentRunEvent[],
  event: AgentRunEvent,
  limit = maxAgentEventHistory,
) {
  if (limit < 1) return [];

  const next = [...events];
  appendCompactedAgentRunEvent(next, event);
  if (next.length <= limit) return next;

  const recent = next.slice(-limit);
  if (recent.some((candidate) => candidate.kind === "artifacts")) {
    return recent;
  }

  const latestArtifacts = findLatestArtifacts(next, next.length - limit);
  if (!latestArtifacts || limit === 1) return recent;

  return [latestArtifacts, ...recent.slice(-(limit - 1))];
}

function findLatestArtifacts(events: AgentRunEvent[], end: number) {
  for (let index = end - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.kind === "artifacts") return event;
  }
  return undefined;
}
