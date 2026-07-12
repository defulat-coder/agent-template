---
id: WEB-QA-023
priority: P0
route: /agent
scenario: chat-disconnected
mode: deterministic
---

# SSE 提前断流

## 前置条件

- 运行 `pnpm qa:web:scenario chat-disconnected`。
- 使用新的 Browser 标签页。

## 操作

1. 输入“测试 SSE 断流”并发送。
2. 等待连接在 terminal result 前结束。

## 预期

- 页面显示 stream ended without a result 的错误信息。
- 主按钮恢复为“重试”，页面不保持运行中状态。

## 证据

- 错误状态截图。
- `/api/agent/chat` v1 frame Response 与 Console 证据。
