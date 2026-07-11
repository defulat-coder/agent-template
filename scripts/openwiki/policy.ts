const openWikiSetupFiles = new Set([
  ".github/workflows/openwiki-update.yml",
  "AGENTS.md",
  "CLAUDE.md",
]);

export function assertAllowedOpenWikiChanges(paths: readonly string[]): void {
  const forbiddenPaths = paths.filter(
    (path) => !path.startsWith("openwiki/") && !openWikiSetupFiles.has(path),
  );

  if (forbiddenPaths.length > 0) {
    throw new Error(
      `OpenWiki changed forbidden paths: ${forbiddenPaths.join(", ")}`,
    );
  }
}

export function validateGeneratedWikiFiles(paths: readonly string[]): void {
  if (!paths.includes("quickstart.md")) {
    throw new Error("OpenWiki output is missing quickstart.md");
  }

  const generatedPages = paths.filter(
    (path) => path.endsWith(".md") && path !== "INSTRUCTIONS.md",
  );

  if (generatedPages.length < 2) {
    throw new Error(
      "OpenWiki output must contain at least one generated page besides quickstart.md",
    );
  }
}

type OpenWikiEnvironment = Readonly<Record<string, string | undefined>>;

export type OpenWikiProviderConfig = {
  provider: string;
  modelId: string;
};

export function resolveOpenWikiProviderConfig(
  environment: OpenWikiEnvironment,
): OpenWikiProviderConfig {
  const provider =
    readValue(environment.OPENWIKI_PROVIDER) ??
    (readValue(environment.ANTHROPIC_API_KEY) ? "anthropic" : undefined);

  if (!provider) {
    throw new Error(
      "OpenWiki provider is not configured; set OPENWIKI_PROVIDER and its provider credentials",
    );
  }

  if (provider === "anthropic" && !readValue(environment.ANTHROPIC_API_KEY)) {
    throw new Error("OpenWiki Anthropic provider requires ANTHROPIC_API_KEY");
  }

  const modelId =
    readValue(environment.OPENWIKI_MODEL_ID) ??
    readValue(environment.ANTHROPIC_MODEL) ??
    readValue(environment.CLAUDE_AGENT_MODEL);

  if (!modelId) {
    throw new Error("OpenWiki model is not configured; set OPENWIKI_MODEL_ID");
  }

  return { provider, modelId };
}

const runtimeEnvironmentKeys = [
  "PATH",
  "LANG",
  "LC_ALL",
  "TMPDIR",
  "CI",
  "COREPACK_HOME",
  "PNPM_HOME",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
] as const;

const providerEnvironmentKeys: Readonly<Record<string, readonly string[]>> = {
  anthropic: ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"],
  baseten: ["BASETEN_API_KEY"],
  fireworks: ["FIREWORKS_API_KEY"],
  openai: ["OPENAI_API_KEY", "OPENAI_BASE_URL"],
  "openai-chatgpt": [
    "OPENAI_CHATGPT_ACCESS_TOKEN",
    "OPENAI_CHATGPT_REFRESH_TOKEN",
    "OPENAI_CHATGPT_EXPIRES_AT",
    "OPENAI_CHATGPT_ACCOUNT_ID",
    "OPENAI_CHATGPT_EMAIL",
    "OPENAI_CHATGPT_PLAN",
  ],
  "openai-compatible": [
    "OPENAI_COMPATIBLE_API_KEY",
    "OPENAI_COMPATIBLE_BASE_URL",
  ],
  openrouter: ["OPENROUTER_API_KEY"],
};

export function createOpenWikiChildEnvironment(
  environment: OpenWikiEnvironment,
  home: string,
  config: OpenWikiProviderConfig,
): NodeJS.ProcessEnv {
  const providerKeys = providerEnvironmentKeys[config.provider];
  if (!providerKeys) {
    throw new Error(`Unsupported OpenWiki provider: ${config.provider}`);
  }

  const childEnvironment: NodeJS.ProcessEnv = {
    HOME: home,
    OPENWIKI_PROVIDER: config.provider,
    OPENWIKI_MODEL_ID: config.modelId,
  };

  for (const key of [...runtimeEnvironmentKeys, ...providerKeys]) {
    const value = readValue(environment[key]);
    if (value) {
      childEnvironment[key] = value;
    }
  }

  return childEnvironment;
}

function readValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
