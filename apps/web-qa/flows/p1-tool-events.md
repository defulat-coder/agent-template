---
id: WEB-QA-030
priority: P1
route: /agent
scenario: chat-tool-events
mode: deterministic
---

# Tool 事件关联

## 前置条件

- 运行 `pnpm qa:web:scenario chat-tool-events`。
- 使用新的 Browser 标签页。

## 操作

1. 输入“测试 Tool 事件”并发送。
2. 检查运行事件顺序与内容。

## 预期

- Tool call 与 Tool result 使用相同 `callId` 和 `toolName`。
- Tool 输入 JSON、Agent output、Final result 均可见且顺序正确。

## 证据

- 完整运行事件截图。
- SSE 消息顺序。
