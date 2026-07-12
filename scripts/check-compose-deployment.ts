import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

type ComposeService = {
  command?: unknown;
  depends_on?: unknown;
  environment?: unknown;
  restart?: unknown;
};

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const compose = parse(
  readFileSync(join(repositoryRoot, "docker-compose.yml"), "utf8"),
  { merge: true },
) as { services?: unknown };
const services = readRecord(compose.services, "services");

const migration = readService(services, "db-migrate");
expectEqual(migration.command, "pnpm db:deploy", "db-migrate.command");
expectEqual(migration.restart, "no", "db-migrate.restart");
expectDependency(migration, "postgres", "service_healthy");

for (const serviceName of ["toolbox", "api", "worker"]) {
  expectDependency(
    readService(services, serviceName),
    "db-migrate",
    "service_completed_successfully",
  );
}

const migrationEnvironment = readEnvironment(migration, "db-migrate");
const api = readService(services, "api");
const apiEnvironment = readEnvironment(api, "api");
expectEqual(
  apiEnvironment.DATABASE_URL,
  migrationEnvironment.DATABASE_URL,
  "api and db-migrate DATABASE_URL",
);

const apiToken = readString(
  apiEnvironment.AGENT_API_TOKEN,
  "api.AGENT_API_TOKEN",
);
if (!apiToken.startsWith("${AGENT_API_TOKEN:?")) {
  throw new Error(
    "api.AGENT_API_TOKEN must fail fast when the deployment token is missing",
  );
}

const webEnvironment = readEnvironment(readService(services, "web"), "web");
expectEqual(
  webEnvironment.AGENT_API_URL,
  "http://api:14000",
  "web.AGENT_API_URL",
);
expectEqual(
  webEnvironment.AGENT_TEMPLATE_TOKEN,
  apiToken,
  "Web and API deployment token",
);

console.log(
  "Docker Compose deployment closure is valid: migrations gate data consumers and Web reaches the authenticated API over the internal network.",
);

function expectDependency(
  service: ComposeService,
  dependencyName: string,
  expectedCondition: string,
) {
  const dependencies = readRecord(service.depends_on, "service.depends_on");
  const dependency = readRecord(
    dependencies[dependencyName],
    `service.depends_on.${dependencyName}`,
  );
  expectEqual(
    dependency.condition,
    expectedCondition,
    `service.depends_on.${dependencyName}.condition`,
  );
}

function expectEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label} must be ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`,
    );
  }
}

function readEnvironment(service: ComposeService, serviceName: string) {
  return readRecord(service.environment, `${serviceName}.environment`);
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a mapping`);
  }

  return value as Record<string, unknown>;
}

function readService(
  services: Record<string, unknown>,
  serviceName: string,
): ComposeService {
  return readRecord(services[serviceName], `services.${serviceName}`);
}

function readString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}
