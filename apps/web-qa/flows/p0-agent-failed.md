---
id: WEB-QA-022
priority: P0
route: /agent
scenario: chat-failed
mode: deterministic
---

# Agent 失败与重试

## 前置条件

- 运行 `pnpm qa:web:scenario chat-failed`。
- 使用新的 Browser 标签页。

## 操作

1. 输入“测试失败状态”并发送。
2. 等待失败结果。

## 预期

- 状态和 Agent 回复显示失败原因。
- 事件时间线显示 Run failed。
- 主按钮恢复为“重试”。

## 证据

- 失败状态截图。
- SSE error/result 消息与 Console 状态。
