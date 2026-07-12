---
id: WEB-QA-020
priority: P0
route: /agent
scenario: chat-completed
mode: deterministic
---

# Agent 正常完成

## 前置条件

- 运行 `pnpm qa:web:scenario chat-completed`。
- 使用新的 Browser 标签页。

## 操作

1. 打开 `/agent`，输入“测试正常回复”。
2. 点击“发送给 Agent”。
3. 观察运行中状态，等待最终结果。

## 预期

- 运行中发送按钮 disabled，并显示“取消运行”。
- 页面显示流式文本、完成状态、Runtime 与 Model。
- 运行事件包含 Agent output 和 Final result。

## 证据

- 运行中与完成后的截图。
- `/api/agent/chat` 为 v1 `event: frame` SSE 且 Console 无未处理错误。
