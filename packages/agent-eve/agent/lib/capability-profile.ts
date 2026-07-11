import {
  parseToolboxAgentConfig,
  type ToolboxToolName,
} from "@agent-template/toolbox-config";

export function hasToolboxCapabilities(
  requiredTools: readonly ToolboxToolName[],
  input: Record<string, unknown> = process.env,
) {
  const toolbox = parseToolboxAgentConfig({
    ...input,
    TOOLBOX_URL:
      input.TOOLBOX_URL ??
      (input.NODE_ENV === "production" ? undefined : "http://localhost:15000"),
  });

  if (!toolbox) return false;

  const allowed = new Set(toolbox.allowedTools);
  return requiredTools.every((tool) => allowed.has(tool));
}
