// Security and process policies for project-local ZRead generation.
type ZReadEnvironment = Readonly<Record<string, string | undefined>>;

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
  const forbiddenPaths = paths.filter(
    (file) => file !== ".zread/state.json" && !file.startsWith(".zread/wiki/"),
  );
  if (forbiddenPaths.length > 0) {
    throw new Error(
      `ZRead changed forbidden paths: ${forbiddenPaths.join(", ")}`,
    );
  }
}

function readValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
