type ZReadEnvironment = Readonly<Record<string, string | undefined>>;

export type ZReadProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: "openai";
};

export const zreadGenerateArguments = [
  "generate",
  "--draft",
  "clear",
  "--yes",
  "--stdio",
] as const;

const kimiAnthropicBaseUrl = "https://api.kimi.com/coding";
const kimiOpenAiBaseUrl = "https://api.kimi.com/coding/v1";

export function resolveZReadProviderConfig(
  environment: ZReadEnvironment,
): ZReadProviderConfig {
  const apiKey =
    readValue(environment.ZREAD_LLM_API_KEY) ??
    readValue(environment.OPENAI_API_KEY) ??
    readValue(environment.ANTHROPIC_API_KEY);
  if (!apiKey) {
    throw new Error(
      "ZRead provider is not configured; set ZREAD_LLM_API_KEY or the existing provider API key",
    );
  }

  const model =
    readValue(environment.ZREAD_LLM_MODEL) ??
    readValue(environment.OPENAI_MODEL) ??
    readValue(environment.ANTHROPIC_MODEL) ??
    readValue(environment.CLAUDE_AGENT_MODEL);
  if (!model) {
    throw new Error("ZRead model is not configured; set ZREAD_LLM_MODEL");
  }

  const explicitBaseUrl =
    readValue(environment.ZREAD_LLM_BASE_URL) ??
    readValue(environment.OPENAI_BASE_URL);
  const anthropicBaseUrl = normalizeUrl(
    readValue(environment.ANTHROPIC_BASE_URL),
  );
  const baseUrl =
    explicitBaseUrl ??
    (anthropicBaseUrl === kimiAnthropicBaseUrl ? kimiOpenAiBaseUrl : undefined);

  if (!baseUrl) {
    throw new Error(
      "ZREAD_LLM_BASE_URL is required when the existing provider is not the Kimi Coding endpoint",
    );
  }

  return {
    apiKey,
    baseUrl: normalizeUrl(baseUrl) ?? baseUrl,
    model,
    provider: "openai",
  };
}

export function createZReadConfigYaml(config: ZReadProviderConfig): string {
  return [
    'language: "zh"',
    'doc_language: "zh"',
    "llm:",
    `  provider: ${quoteYaml(config.provider)}`,
    `  model: ${quoteYaml(config.model)}`,
    `  api_key: ${quoteYaml(config.apiKey)}`,
    `  base_url: ${quoteYaml(config.baseUrl)}`,
    "concurrency:",
    "  max_concurrent: 2",
    "  max_retries: 1",
    "",
  ].join("\n");
}

const runtimeEnvironmentKeys = [
  "PATH",
  "LANG",
  "LC_ALL",
  "TMPDIR",
  "CI",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
] as const;

export function createZReadChildEnvironment(
  environment: ZReadEnvironment,
  home: string,
): NodeJS.ProcessEnv {
  const childEnvironment: NodeJS.ProcessEnv = { HOME: home };

  for (const key of runtimeEnvironmentKeys) {
    const value = readValue(environment[key]);
    if (value) {
      childEnvironment[key] = value;
    }
  }

  return childEnvironment;
}

export function assertAllowedZReadChanges(paths: readonly string[]): void {
  const forbiddenPaths = paths.filter((file) => !file.startsWith(".zread/"));
  if (forbiddenPaths.length > 0) {
    throw new Error(
      `ZRead changed forbidden paths: ${forbiddenPaths.join(", ")}`,
    );
  }
}

export function parseZReadVersionOutput(
  output: string,
  expectedVersion: string,
): string {
  const events = parseEvents(output.split("\n").filter(Boolean));
  const version = events.find((event) => event.done === true)?.vm?.version;
  if (typeof version !== "string") {
    throw new Error(
      "ZRead version command did not emit a terminal version event",
    );
  }
  if (version !== expectedVersion) {
    throw new Error(
      `Expected ZRead CLI ${expectedVersion}, received ${version}`,
    );
  }
  return version;
}

export function validateZReadEventStream(lines: readonly string[]): void {
  const events = parseEvents(lines.filter((line) => line.trim().length > 0));

  for (const event of events) {
    if (typeof event.error === "string" && event.error.trim()) {
      throw new Error(`ZRead generation failed: ${event.error.trim()}`);
    }
    if (event.vm?.state === "error") {
      throw new Error("ZRead generation entered an error state");
    }
  }

  if (!events.some((event) => event.done === true)) {
    throw new Error("ZRead generation exited without a terminal done event");
  }
}

type ZReadEvent = {
  done?: unknown;
  error?: unknown;
  vm?: { state?: unknown; version?: unknown };
};

function parseEvents(lines: readonly string[]): ZReadEvent[] {
  return lines.map((line) => {
    try {
      const event = JSON.parse(line) as unknown;
      if (!event || typeof event !== "object" || Array.isArray(event)) {
        throw new Error("event must be an object");
      }
      return event as ZReadEvent;
    } catch (error) {
      throw new Error(`ZRead emitted invalid JSONL: ${line}`, { cause: error });
    }
  });
}

function quoteYaml(value: string): string {
  return JSON.stringify(value);
}

function normalizeUrl(value: string | undefined): string | undefined {
  return value?.replace(/\/+$/u, "");
}

function readValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
