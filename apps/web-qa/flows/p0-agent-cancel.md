---
id: WEB-QA-021
priority: P0
route: /agent
scenario: chat-slow-cancellable
mode: deterministic
---

# Agent 运行取消

## 前置条件

- 运行 `pnpm qa:web:scenario chat-slow-cancellable`。
- 使用新的 Browser 标签页。

## 操作

1. 输入“测试取消运行”并发送。
2. 首个运行事件出现后点击“取消运行”。

## 预期

- SSE 请求被浏览器取消。
- 状态显示“Agent run 已取消”。
- 页面恢复可再次发送，不出现最终成功结果。

## 证据

- 取消前后截图。
- Network 中 `/agent/chat` 的取消状态。
