# Web QA 协作指南

## 职责

- `apps/web-qa` 为 Codex Desktop Browser 提供确定性 HTTP/SSE fixture、测试 flows 和报告模板。
- 生产 adapter 是 `apps/api`；QA adapter 只监听本机，不进入生产部署。
- HTTP/SSE 数据必须通过 `@agent-template/shared` schema，不复制 Agent 协议。

## 命令

| 任务 | 命令 |
| --- | --- |
| 启动 QA 环境 | `pnpm qa:web:start` |
| 切换场景 | `pnpm qa:web:scenario <name>` |
| 完整检查 | `pnpm qa:web:check` |
| 单测 | `pnpm --filter @agent-template/web-qa test -- src/server.test.ts` |

## Browser 流程

- 仅在 Codex Desktop 使用 `@Browser` 执行 `flows/*.md`。
- 每个 case 使用新标签页；先设置 flow 指定的 scenario。
- 失败必须记录 expected、actual、复现步骤、截图；必要时补 Console 和 Network 证据。
- 修复后只重跑失败 case，再执行一次 P0 smoke。
- 运行报告写入 `.scratch/web-qa/runs/<timestamp>/`，不要提交临时截图和证据。

## 约束

- 不把 QA fixture 接入 `AGENT_RUNTIME`，不调用真实模型、数据库、Redis 或 Toolbox。
- 不给 `apps/web-qa` 添加 `dev` script，避免根 `pnpm dev` 自动启动 QA 环境。
- 场景变化集中在 `src/scenarios.ts`；新增场景必须有 HTTP contract test 和至少一个 flow。

## 提交

- 遵循根 `AGENTS.md`；AI 提交包含自身 `Co-Authored-By`。
