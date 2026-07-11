# Web QA 测试计划

本计划覆盖模板当前可见 Web 功能。确定性回归使用 QA adapter；真实全栈冒烟只验证生产链路到达合理终态，不断言模型输出文案。

## 执行门禁

- 每次 Web 交互或 Agent Chat SSE 变更：执行全部 P0。
- Tool、Artifact、Markdown 或 health 展示变更：执行相关 P1，再执行 `WEB-QA-001`。
- 布局、样式或可访问性变更：执行 `WEB-QA-070` 和全部 P0。
- 发布前：执行全部 P0、受影响的 P1，以及一轮真实全栈冒烟。

## 功能矩阵

| ID | 优先级 | 功能点 | 场景 | 主要断言 | Flow |
| --- | --- | --- | --- | --- | --- |
| WEB-QA-001 | P0 | 首页与健康状态 | `health-ok` | API、PostgreSQL、Redis/BullMQ 状态及 Agent 入口 | `flows/p0-home-smoke.md` |
| WEB-QA-010 | P0 | Prompt 必填校验 | `health-ok` | 空输入不会发请求，展示中文校验并可重试 | `flows/p0-agent-validation.md` |
| WEB-QA-020 | P0 | Agent 正常完成 | `chat-completed` | 运行中、流式文本、完成结果、Runtime/Model、事件时间线 | `flows/p0-agent-completed.md` |
| WEB-QA-021 | P0 | Agent 主动取消 | `chat-slow-cancellable` | 处理中可取消，取消后恢复可发送状态 | `flows/p0-agent-cancel.md` |
| WEB-QA-022 | P0 | Agent 失败 | `chat-failed` | 失败原因、失败事件、重试入口 | `flows/p0-agent-failed.md` |
| WEB-QA-023 | P0 | SSE 提前断流 | `chat-disconnected` | 无 terminal result 时退出运行态并可重试 | `flows/p0-agent-disconnected.md` |
| WEB-QA-030 | P1 | Tool 调用事件 | `chat-tool-events` | `callId`/`toolName` 关联及折叠展示 | `flows/p1-tool-events.md` |
| WEB-QA-040 | P1 | Artifact 展示 | `chat-artifacts` | Artifact 元数据与下载/展示入口 | `flows/p1-artifacts.md` |
| WEB-QA-050 | P1 | Markdown 回复 | `chat-markdown` | 标题、列表、表格、代码块和链接 | `flows/p1-markdown.md` |
| WEB-QA-060 | P1 | 健康状态降级 | `health-degraded` | degraded/error/unavailable 的状态与详情 | `flows/p1-health-degraded.md` |
| WEB-QA-061 | P1 | Runtime 未配置 | `chat-skipped` | skipped 原因与可恢复状态 | `flows/p1-runtime-skipped.md` |
| WEB-QA-070 | P2 | 响应式与可访问性 | `chat-completed` | 关键断点、键盘路径、名称与焦点 | `flows/p2-responsive-accessibility.md` |

## 真实全栈冒烟

Web 连接 `apps/api:14000`，使用部署选定的 Agent runtime。只断言：页面能创建 Agent run、SSE 能产生事件、运行最终进入 completed、failed、cancelled 或 skipped 之一，且 Console 无未处理错误。真实模型文案、Tool 调用顺序和耗时不作为确定性断言。
