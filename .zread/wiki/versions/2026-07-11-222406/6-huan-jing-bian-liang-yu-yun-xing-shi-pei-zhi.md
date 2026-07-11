本页说明 Agent Template 如何通过集中式 `.env` 文件、按应用细分的 Zod 校验层以及 Docker 编排，把同一套环境变量分发到 API、Worker、Web、Eve Agent 和 Claude Agent 等多个运行时。理解这些配置边界后，你可以在本地开发、CI 验证与容器化部署之间保持一致的运行时行为。

## 配置分层：从 .env 到运行时

项目采用“**一份示例、多处解析、显式默认值**”的配置策略。`.env.example` 不是运行文件，而是所有合法环境变量的权威清单；真正注入运行时的是 `docker-compose.yml` 或本地 `.env`（`.gitignore` 排除）。各应用再用 Zod Schema 做类型校验和缺省兜底，确保缺少文件时也能启动。

```mermaid
flowchart LR
    A[.env.example] -->|变量清单| B[docker-compose.yml]
    A -->|本地覆盖| C[.env]
    B -->|注入容器| D[api/worker/web/eve]
    C -->|tsx --env-file| E[api dev]
    D --> F[Zod Schema parse]
    E --> F
    F --> G[带默认值的类型安全对象]
```

Sources: [.env.example](.env.example#L1-L38), [docker-compose.yml](docker-compose.yml#L3-L19), [apps/api/src/env.ts](apps/api/src/env.ts#L1-L40), [apps/worker/src/env.ts](apps/worker/src/env.ts#L1-L13)

## 环境变量速查

按职责把环境变量划分为 6 类。下表给出关键变量、含义与由谁消费。

| 类别 | 变量名 | 默认值 | 消费者 |
|---|---|---|---|
| **基础运行** | `NODE_ENV` | `development` | 全应用 |
| | `LOG_LEVEL` | `info` | logger 包 |
| **数据库** | `DATABASE_URL` | `postgresql://project_template:project_template@localhost:15432/project_template?schema=public` | db 包、api、worker |
| | `ECOMMERCE_FIXTURE_DATABASE_URL` | 复用 `DATABASE_URL` 但强制 schema 为 `ecommerce_fixture` | ecommerce-fixture 包 |
| **缓存与队列** | `REDIS_URL` | `redis://localhost:16379` | api、worker |
| **Agent 运行时** | `AGENT_RUNTIME` | `claude` | agent 包 |
| | `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` | 空 | Claude Agent |
| | `ANTHROPIC_BASE_URL` | `https://api.kimi.com/coding/` | Claude Agent |
| | `ANTHROPIC_MODEL` / `CLAUDE_AGENT_MODEL` | `kimi-for-coding` | Claude Agent |
| | `EVE_AGENT_HOST` | 空 | Eve Agent |
| | `EVE_AGENT_MODEL` | `kimi-for-coding` | Eve Agent |
| | `EVE_AGENT_SERVICE_TOKEN` | 空 | Eve Agent 通道认证 |
| **Toolbox / MCP** | `TOOLBOX_URL` | `http://localhost:15000` | api、worker、Eve Agent |
| | `TOOLBOX_AUTH_TOKEN` | 空 | toolbox-config |
| | `AGENT_CAPABILITY_PROFILE` | `development-all` | toolbox-config |
| **平台网络** | `API_HOST` / `API_PORT` | `0.0.0.0` / `14000` | api |
| | `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:14000` | web、cli |
| | `AGENT_API_URL` | 空 | web 代理路由 |
| | `AGENT_TEMPLATE_TOKEN` / `AGENT_API_TOKEN` | 空 | web 代理、cli |

Sources: [.env.example](.env.example#L1-L38), [packages/shared/src/agent-runtime.ts](packages/shared/src/agent-runtime.ts#L1-L3), [packages/db/src/config.ts](packages/db/src/config.ts#L1-L7), [packages/ecommerce-fixture/src/config.ts](packages/ecommerce-fixture/src/config.ts#L1-L15)

## 各应用/包的配置入口

### API 服务：`apps/api/src/env.ts`

API 在进程启动时立即调用 `loadEnv()`，把整个 `process.env` 传给 Zod Schema 解析。`EnvSchema` 复用 `AgentRuntimeEnvSchema`，并加入数据库、Redis、网络端口、Token 和 CORS 等字段。生产模式下如果 `AGENT_API_TOKEN` 缺失会抛出校验错误。

```ts
export const EnvSchema = AgentRuntimeEnvSchema.extend({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().default(defaultDatabaseUrl),
  REDIS_URL: z.string().url().default("redis://localhost:16379"),
  TOOLBOX_URL: z.string().url().default("http://localhost:15000"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(14000),
  AGENT_API_TOKEN: z.string().min(16).optional(),
  AGENT_LEGACY_ROUTES_ENABLED: z.enum(["true", "false"]).optional(),
  CORS_ORIGIN: z.string().default("http://localhost:13000"),
}).superRefine((env, context) => {
  if (env.NODE_ENV === "production" && !env.AGENT_API_TOKEN) {
    context.addIssue({ code: "custom", path: ["AGENT_API_TOKEN"], message: "..." });
  }
});
```

Sources: [apps/api/src/env.ts](apps/api/src/env.ts#L1-L40), [apps/api/src/server.ts](apps/api/src/server.ts#L1-L13)

### Worker 服务：`apps/worker/src/env.ts`

Worker 只需要 Redis 和 Agent 运行时变量，因此它的 Schema 更薄，并通过测试验证在 Worker 解析后仍然保留 `AGENT_RUNTIME` 等 Agent 运行时字段。

Sources: [apps/worker/src/env.ts](apps/worker/src/env.ts#L1-L13), [apps/worker/src/env.test.ts](apps/worker/src/env.test.ts#L1-L18)

### Agent 运行时：`packages/agent/src/index.ts`

`AgentRuntimeEnvSchema` 是整个项目关于 Agent 运行时的核心配置契约。它定义 `AGENT_RUNTIME`（`claude` 或 `eve`）、Anthropic 与 Eve 相关变量、Toolbox 认证与能力画像。`parseAgentRuntimeEnv` 和 `getAgentRuntimeStateFromEnv` 负责把原始环境变量转换为类型安全的运行时状态。

```ts
export const AgentRuntimeEnvSchema = z.object({
  AGENT_RUNTIME: AgentRuntimeNameSchema.default(defaultAgentRuntimeName),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_AUTH_TOKEN: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  ANTHROPIC_MODEL: z.string().default(defaultClaudeAgentModel),
  CLAUDE_AGENT_MODEL: z.string().default(defaultClaudeAgentModel),
  CLAUDE_PROJECT_DIR: z.string().optional(),
  EVE_AGENT_HOST: z.string().optional(),
  EVE_AGENT_MODEL: z.string().default(defaultEveAgentModel),
  EVE_AGENT_SERVICE_TOKEN: z.string().optional(),
  AGENT_CAPABILITY_PROFILE: ToolboxCapabilityProfileSchema.default("development-all"),
  TOOLBOX_AUTH_TOKEN: z.string().optional(),
  TOOLBOX_URL: z.string().url().optional(),
});
```

Sources: [packages/agent/src/index.ts](packages/agent/src/index.ts#L43-L58), [packages/agent/src/index.test.ts](packages/agent/src/index.test.ts#L12-L47)

### Claude Agent 运行时：`packages/agent-claude/src/index.ts`

Claude Agent 通过 `parseClaudeAgentConfig` 读取 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_BASE_URL` 和 `CLAUDE_AGENT_MODEL`。它还会调用 `parseToolboxAgentConfig` 把 `TOOLBOX_URL` 与 `TOOLBOX_AUTH_TOKEN` 转换成 MCP 工具服务器配置。启动子进程时，会屏蔽掉 `AGENT_CAPABILITY_PROFILE`、`CLAUDE_PROJECT_DIR`、`TOOLBOX_AUTH_TOKEN`、`TOOLBOX_URL` 等上层变量，只向子进程传递必要的 Anthropic 变量。

Sources: [packages/agent-claude/src/index.ts](packages/agent-claude/src/index.ts#L31-L98), [packages/agent-claude/src/index.ts](packages/agent-claude/src/index.ts#L677-L711)

### Eve Agent 运行时：`packages/agent-eve/`

Eve Agent 的配置分散在 `agent/agent.ts` 和 `agent/connections/toolbox.ts` 中。`agent.ts` 直接读取 `process.env` 创建 Anthropic model；`connections/toolbox.ts` 读取 `TOOLBOX_URL`、`TOOLBOX_AUTH_TOKEN`、`AGENT_CAPABILITY_PROFILE` 定义 MCP 工具连接。`agent/channels/eve.ts` 读取 `EVE_AGENT_SERVICE_TOKEN` 与 `NODE_ENV` 决定认证策略。

Sources: [packages/agent-eve/agent/agent.ts](packages/agent-eve/agent/agent.ts#L1-L11), [packages/agent-eve/agent/connections/toolbox.ts](packages/agent-eve/agent/connections/toolbox.ts#L1-L30), [packages/agent-eve/agent/channels/eve.ts](packages/agent-eve/agent/channels/eve.ts#L5-L33)

### Web 与 CLI：`apps/web` / `apps/cli`

Web 的 Next.js 路由通过 `process.env.AGENT_API_URL` 或 `NEXT_PUBLIC_API_BASE_URL` 定位上游 API，并通过 `AGENT_TEMPLATE_TOKEN` / `AGENT_API_TOKEN` 完成代理认证。CLI 默认连接 `http://localhost:14000`，同样支持 `AGENT_TEMPLATE_TOKEN`。

Sources: [apps/web/app/api/agent/chat/route.ts](apps/web/app/api/agent/chat/route.ts#L7-L18), [apps/web/src/lib/agent-client.ts](apps/web/src/lib/agent-client.ts#L31-L35), [apps/cli/src/cli.ts](apps/cli/src/cli.ts#L8-L16)

### 工具库

- `packages/db/config`：提供 `defaultDatabaseUrl` 和 `getDatabaseUrl`，本地开发时无需设置 `DATABASE_URL`。
- `packages/ecommerce-fixture/config`：把 `ECOMMERCE_FIXTURE_DATABASE_URL` 或 `DATABASE_URL` 的 schema 强制替换为 `ecommerce_fixture`，实现 schema 隔离。
- `packages/logger`：从 `process.env.LOG_LEVEL` 读取日志级别。
- `packages/toolbox-config`：解析能力画像、把工具白名单和 MCP URL 规范化。

Sources: [packages/db/src/config.ts](packages/db/src/config.ts#L1-L7), [packages/ecommerce-fixture/src/config.ts](packages/ecommerce-fixture/src/config.ts#L1-L15), [packages/logger/src/index.ts](packages/logger/src/index.ts#L7-L17), [packages/toolbox-config/src/index.ts](packages/toolbox-config/src/index.ts#L88-L131)

## 运行时选择：`AGENT_RUNTIME`

`AGENT_RUNTIME` 是最重要的部署级开关，决定 API 与 Worker 加载哪个 Agent 运行时适配器。默认 `claude`，可选 `eve`。`agent` 包在加载时只加载被选中运行时的动态 chunk，避免把两个大依赖同时打包到入口文件中。

```mermaid
flowchart TD
    A[AGENT_RUNTIME=claude] --> B[加载 @agent-template/agent-claude]
    B --> C{ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN?}
    C -->|有| D[运行 Claude Agent]
    C -->|无| E[运行时就绪检查失败]
    F[AGENT_RUNTIME=eve] --> G[加载 @agent-template/agent-eve]
    G --> H{EVE_AGENT_HOST?}
    H -->|有| I[通过 HTTP 调用 Eve Agent]
    H -->|无| J[运行时就绪检查失败]
```

Sources: [packages/agent/src/index.ts](packages/agent/src/index.ts#L40-L45), [packages/agent/src/index.ts](packages/agent/src/index.ts#L106-L125), [scripts/check-runtime-bundle-boundary.ts](scripts/check-runtime-bundle-boundary.ts#L1-L44)

## Docker 与本地开发配置

### 本地开发

根目录 `package.json` 的 `dev` 脚本调用 `turbo dev`，由各应用自己加载 `.env`。例如 API 使用 `tsx watch --env-file=../../.env src/server.ts`。

Sources: [package.json](package.json#L8-L10), [apps/api/package.json](apps/api/package.json#L5-L7), [apps/worker/package.json](apps/worker/package.json#L5-L7)

### Docker Compose

`docker-compose.yml` 使用 YAML anchors 把公共运行时环境抽成 `x-runtime-environment`，再注入 `api`、`worker`、`eve-agent` 服务。容器内数据库地址从 `localhost:15432` 切换为 `postgres:5432`，Redis 从 `localhost:16379` 切换为 `redis:6379`。Web 服务只保留 `NEXT_PUBLIC_API_BASE_URL` 和 `NODE_ENV`，因为它不需要直接访问数据库或 Redis。

Sources: [docker-compose.yml](docker-compose.yml#L3-L19), [docker-compose.yml](docker-compose.yml#L93-L167)

### Dockerfile

生产镜像基于 `node:24-alpine`，通过 `.nvmrc` 锁定 Node 版本，构建阶段安装所有依赖并执行 `pnpm build`。运行阶段不重新安装，只执行各服务的 `start` 脚本。

Sources: [Dockerfile](Dockerfile#L1-L26), [.nvmrc](.nvmrc#L1-L2)

## 配置验证与测试

项目为关键配置函数编写了单元测试，确保默认值、fallback、schema 强制覆盖等行为不被意外破坏。例如 `packages/ecommerce-fixture/src/config.test.ts` 验证无论传入什么 URL，schema 都会被强制改为 `ecommerce_fixture`。

Sources: [packages/agent/src/index.test.ts](packages/agent/src/index.test.ts#L1-L80), [packages/db/src/config.test.ts](packages/db/src/config.test.ts#L1-L15), [packages/ecommerce-fixture/src/config.test.ts](packages/ecommerce-fixture/src/config.test.ts#L1-L24)

## 常见配置问题

| 现象 | 可能原因 | 排查方向 |
|---|---|---|
| API 启动报 `AGENT_API_TOKEN is required in production` | 生产环境未设置 Token | 检查 `NODE_ENV` 和 `AGENT_API_TOKEN` |
| Claude Agent 无法运行 | 缺少 `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` | 查看 Agent runtime readiness 检查 |
| Eve Agent 无法连接 | `EVE_AGENT_HOST` 缺失或错误 | 确认 Eve Agent 服务地址 |
| Web Chat 无响应 | 上游 API 地址错误 | 检查 `NEXT_PUBLIC_API_BASE_URL` 和 `AGENT_API_URL` |
| Toolbox 工具权限不足 | 使用了 `development-all` 且带 `TOOLBOX_AUTH_TOKEN` | 设置非 `development-all` 的 `AGENT_CAPABILITY_PROFILE` |

Sources: [apps/api/src/env.ts](apps/api/src/env.ts#L17-L25), [packages/toolbox-config/src/index.ts](packages/toolbox-config/src/index.ts#L99-L114), [packages/agent/src/index.ts](packages/agent/src/index.ts#L106-L125)

## 下一步

- 若需了解这些变量如何驱动 Agent 执行流程，请阅读 [Agent Run 生命周期与执行租约](8-agent-run-sheng-ming-zhou-qi-yu-zhi-xing-zu-yue)。
- 若需深入 Claude 与 Eve 两个运行时的适配细节，请阅读 [Claude Agent Runtime 适配](9-claude-agent-runtime-gua-pei) 和 [Eve Agent Runtime 适配](10-eve-agent-runtime-gua-pei)。
- 若需查看生产部署与运维命令，请阅读 [Docker 部署与生产运维](17-docker-bu-shu-yu-sheng-chan-yun-wei)。