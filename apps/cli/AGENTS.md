# CLI 协作指南

## 职责

`apps/cli` 是基于 Incur 的可安装命令行进程，将 Agent conversation、Agent run 和 Agent job Interface 暴露给人、脚本和其他 Agent。

## 规则

- 命令只通过 `@agent-template/agent-client` 调用远端 API。
- 不直接依赖 Fastify、Prisma、BullMQ、Claude SDK 或 Eve。
- 使用 Incur 的 `Cli.create()`、`.command()`、`.serve()`；args、options、env、output 使用 Zod schema 描述。
- `--format`、`--schema`、`--llms`、`--mcp`、`skills`、`completions` 由 Incur 提供，不重复实现同名能力。
- 进度与诊断写 stderr，稳定结果写 stdout；机器流使用 JSONL。
- Token 只从 `AGENT_TEMPLATE_TOKEN` 读取，不提供 `--token`。
- Runtime 由部署环境选择，CLI 不提供 Runtime 切换参数。

## Incur 官方资料

- 总览与用法：<https://github.com/wevm/incur#readme>
- Agent 开发参考：<https://github.com/wevm/incur/blob/main/SKILL.md>
- 版本变更：<https://github.com/wevm/incur/blob/main/CHANGELOG.md>
- npm 包：<https://www.npmjs.com/package/incur>
- 修改 Incur 接口或升级依赖前，先核验当前安装版本的导出类型，再对照官方 SKILL 与 CHANGELOG；不凭记忆补 API。

## 验证

```bash
pnpm --filter @agent-template/cli lint
pnpm --filter @agent-template/cli typecheck
pnpm --filter @agent-template/cli test
pnpm --filter @agent-template/cli build
```
