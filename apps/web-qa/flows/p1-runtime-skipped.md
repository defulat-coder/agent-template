---
id: WEB-QA-061
priority: P1
route: /agent
scenario: chat-skipped
mode: deterministic
---

# Runtime 未配置

## 前置条件

- 运行 `pnpm qa:web:scenario chat-skipped`。
- 使用新的 Browser 标签页。

## 操作

1. 输入“测试 runtime 未配置”并发送。
2. 等待 skipped 结果。

## 预期

- 状态显示“Agent runtime 未配置，未执行”。
- 回复显示 fixture 的 skipped reason，页面可继续操作。

## 证据

- skipped 状态截图。
- SSE result 内容。
