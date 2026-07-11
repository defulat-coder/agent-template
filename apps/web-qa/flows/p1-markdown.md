---
id: WEB-QA-050
priority: P1
route: /agent
scenario: chat-markdown
mode: deterministic
---

# Markdown 渲染

## 前置条件

- 运行 `pnpm qa:web:scenario chat-markdown`。
- 使用新的 Browser 标签页。

## 操作

1. 输入“测试 Markdown”并发送。
2. 检查标题、列表、表格、代码块和链接。

## 预期

- Markdown 结构正确，无嵌套 `<p>` 或横向溢出。
- 链接在新标签页打开并带安全 rel 属性。

## 证据

- 完整回复截图。
- DOM、Console 与链接属性。
