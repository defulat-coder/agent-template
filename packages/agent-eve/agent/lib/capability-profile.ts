import {
  parseToolboxAgentConfig,
  type ToolboxSkillName,
  type ToolboxToolName,
} from "@agent-template/toolbox-config";

export function hasToolboxSkill(
  skillName: ToolboxSkillName,
  input: Record<string, unknown> = process.env,
) {
  const toolbox = readEveToolboxConfig(input);
  return toolbox?.enabledSkills.includes(skillName) ?? false;
}

export function hasToolboxCapabilities(
  requiredTools: readonly ToolboxToolName[],
  input: Record<string, unknown> = process.env,
) {
  const toolbox = readEveToolboxConfig(input);
  if (!toolbox) return false;

  const allowed = new Set(toolbox.semanticExecutionTools);
  return requiredTools.every((tool) => allowed.has(tool));
}

export function readEveToolboxConfig(input: Record<string, unknown>) {
  const toolbox = parseToolboxAgentConfig({
    ...input,
    TOOLBOX_URL:
      input.TOOLBOX_URL ??
      (input.NODE_ENV === "production" ? undefined : "http://localhost:15000"),
  });
  return toolbox;
}
