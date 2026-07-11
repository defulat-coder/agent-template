---
id: WEB-QA-001
priority: P0
route: /
scenario: health-ok
mode: deterministic
---

# 首页与导航冒烟

## 前置条件

- 运行 `pnpm qa:web:scenario health-ok`。
- 使用新的 Browser 标签页。

## 操作

1. 打开 `http://localhost:13000`。
2. 检查 API、PostgreSQL、Redis/BullMQ 状态。
3. 点击“打开 Agent 控制台”。

## 预期

- 三个状态面板均显示可用状态。
- 点击后进入 `/agent`，显示 Prompt 和“发送给 Agent”。

## 证据

- 首页截图和 `/agent` 截图。
- 失败时记录 Console 与 `/health` Network 状态。
