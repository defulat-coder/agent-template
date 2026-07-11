import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

type ZReadEnvironment = Readonly<Record<string, string | undefined>>;

const ConfigIndexSchema = z
  .object({
    files: z.array(z.string().min(1)).min(1),
  })
  .strict();

const ProjectConfigSchema = z
  .object({
    concurrency: z
      .object({
        max_concurrent: z.number().int().positive(),
        max_retries: z.number().int().nonnegative(),
      })
      .strict(),
    doc_language: z.string().min(1),
    language: z.enum(["en", "zh"]),
    llm: z
      .object({
        base_url: z.url().refine(isHttpUrl, "must use http or https"),
        model: z.string().min(1),
        provider: z.literal("openai"),
      })
      .strict(),
  })
  .strict();

export type ZReadRuntimeConfig = z.infer<typeof ProjectConfigSchema> & {
  llm: z.infer<typeof ProjectConfigSchema>["llm"] & { api_key: string };
};

export type ComposedZReadConfig = {
  assertSafeText: (content: string, label: string) => void;
  files: string[];
  yaml: string;
};

export async function composeProjectZReadConfig(
  configDirectory: string,
  environment: ZReadEnvironment,
): Promise<ComposedZReadConfig> {
  const index = ConfigIndexSchema.parse(
    parseYaml(
      await readFile(path.join(configDirectory, "index.yaml"), "utf8"),
      "index.yaml",
    ),
  );
  assertConfigFileNames(index.files);

  let merged: unknown = {};
  for (const file of index.files) {
    const fragment = parseYaml(
      await readFile(path.join(configDirectory, file), "utf8"),
      file,
    );
    assertNoCommittedApiKey(fragment, file);
    merged = mergeObjects(merged, fragment);
  }

  const project = ProjectConfigSchema.parse(merged);
  const provider = resolveProviderProfile(project.llm, environment);
  const runtimeConfig: ZReadRuntimeConfig = {
    ...project,
    llm: provider,
  };

  return {
    assertSafeText(content, label) {
      if (content.includes(provider.api_key)) {
        throw new Error(`${label} contains the configured provider credential`);
      }
    },
    files: [...index.files],
    yaml: createZReadConfigYaml(runtimeConfig),
  };
}

function createZReadConfigYaml(config: ZReadRuntimeConfig): string {
  return YAML.stringify(config, { lineWidth: 0 });
}

function parseYaml(content: string, file: string): unknown {
  try {
    return YAML.parse(content);
  } catch (error) {
    throw new Error(`Invalid ZRead config YAML in ${file}`, { cause: error });
  }
}

function assertConfigFileNames(files: readonly string[]): void {
  const seen = new Set<string>();
  for (const file of files) {
    if (!/^[a-z0-9][a-z0-9._-]*\.ya?ml$/u.test(file) || file === "index.yaml") {
      throw new Error(`Invalid ZRead config fragment path: ${file}`);
    }
    if (seen.has(file)) {
      throw new Error(`Duplicate ZRead config fragment: ${file}`);
    }
    seen.add(file);
  }
}

function assertNoCommittedApiKey(fragment: unknown, file: string): void {
  if (
    isPlainObject(fragment) &&
    isPlainObject(fragment.llm) &&
    Object.hasOwn(fragment.llm, "api_key")
  ) {
    throw new Error(
      `ZRead config fragment ${file} must not contain llm.api_key; inject it through the environment`,
    );
  }
}

function mergeObjects(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      throw new Error(`Unsafe ZRead config key: ${key}`);
    }
    merged[key] = mergeObjects(merged[key], value);
  }
  return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function resolveProviderProfile(
  project: z.infer<typeof ProjectConfigSchema>["llm"],
  environment: ZReadEnvironment,
): ZReadRuntimeConfig["llm"] {
  const profiles = [
    {
      baseUrl: readValue(environment.ZREAD_LLM_BASE_URL),
      key: readValue(environment.ZREAD_LLM_API_KEY),
      model: readValue(environment.ZREAD_LLM_MODEL),
      name: "ZREAD_LLM",
    },
    {
      baseUrl: readValue(environment.OPENAI_BASE_URL),
      key: readValue(environment.OPENAI_API_KEY),
      model: readValue(environment.OPENAI_MODEL),
      name: "OPENAI",
    },
    {
      baseUrl: readValue(environment.ANTHROPIC_BASE_URL),
      key: readValue(environment.ANTHROPIC_API_KEY),
      model: readValue(environment.ANTHROPIC_MODEL),
      name: "ANTHROPIC_KIMI",
    },
  ].filter((profile) => profile.key || profile.baseUrl || profile.model);

  if (profiles.length === 0) {
    throw new Error(
      "ZRead provider is not configured; set ZREAD_LLM_API_KEY for the project profile or one complete provider environment profile",
    );
  }
  if (profiles.length > 1) {
    throw new Error(
      `Multiple ZRead provider environment profiles are active: ${profiles.map((profile) => profile.name).join(", ")}`,
    );
  }

  const [profile] = profiles;
  if (
    profile.name === "ZREAD_LLM" &&
    profile.key &&
    !profile.baseUrl &&
    !profile.model
  ) {
    return { ...project, api_key: profile.key };
  }
  if (!profile.key || !profile.baseUrl || !profile.model) {
    throw new Error(
      `${profile.name} must provide API key, BaseURL, and model as one complete profile`,
    );
  }

  const baseUrl = normalizeUrl(profile.baseUrl) ?? profile.baseUrl;
  if (profile.name === "ANTHROPIC_KIMI") {
    if (baseUrl !== "https://api.kimi.com/coding") {
      throw new Error(
        "ANTHROPIC_KIMI profile only supports https://api.kimi.com/coding",
      );
    }
    return {
      api_key: profile.key,
      base_url: "https://api.kimi.com/coding/v1",
      model: profile.model,
      provider: "openai",
    };
  }
  if (!isHttpUrl(baseUrl)) {
    throw new Error(`${profile.name} BaseURL must use http or https`);
  }
  return {
    api_key: profile.key,
    base_url: baseUrl,
    model: profile.model,
    provider: "openai",
  };
}

function normalizeUrl(value: string | undefined): string | undefined {
  return value?.replace(/\/+$/u, "");
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function readValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
