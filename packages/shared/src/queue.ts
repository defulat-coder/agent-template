export type BullMqConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  maxRetriesPerRequest: null;
};

export function createBullMqConnectionOptions(
  redisUrl: string,
): BullMqConnectionOptions {
  const parsed = new URL(redisUrl);
  const options: BullMqConnectionOptions = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    maxRetriesPerRequest: null,
  };

  if (parsed.username) {
    options.username = decodeURIComponent(parsed.username);
  }

  if (parsed.password) {
    options.password = decodeURIComponent(parsed.password);
  }

  if (parsed.pathname.length > 1) {
    const db = Number(parsed.pathname.slice(1));

    if (!Number.isInteger(db) || db < 0) {
      throw new Error(
        "Redis URL database index must be a non-negative integer",
      );
    }

    options.db = db;
  }

  return options;
}
