# Web QA

Codex Desktop Browser 的页面级功能验证模块。它提供确定性 QA adapter，不替代生产 API，也不声明为无人值守 CI E2E runner。

完整功能矩阵、优先级和执行门禁见 [`TEST_PLAN.md`](./TEST_PLAN.md)。

## 快速开始

```bash
pnpm qa:web:start
pnpm qa:web:scenario chat-completed
```

在 Codex Desktop 中使用：

```text
使用 @Browser 执行 apps/web-qa/flows/p0-agent-completed.md。
每个 case 使用新标签页，失败时保存截图、Console 和 Network 证据。
修复后重跑失败 case，最后执行 P0 smoke。
```

Web 地址为 `http://localhost:13000`，fixture 默认为 `http://127.0.0.1:14100`。fixture 只实现 Web gateway 实际消费的 v1 Agent frame interface；`pnpm qa:web:start` 通过服务端 `AGENT_API_URL` 接线，退出时会清理两个子进程。

## 两种验证模式

- 确定性页面回归：Web 连接本模块；适合 loading、SSE、Tool、Artifact、失败与取消状态。
- 真实全栈冒烟：Web 连接 `apps/api:14000`；只断言真实链路能到达合理终态，不断言模型具体文案。

## 报告

复制 `templates/run-report.md` 到 `.scratch/web-qa/runs/<timestamp>/report.md`。临时截图和 Network/Console 证据放在同一运行目录。
