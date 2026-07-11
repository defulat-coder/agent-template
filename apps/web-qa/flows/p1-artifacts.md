---
id: WEB-QA-040
priority: P1
route: /agent
scenario: chat-artifacts
mode: deterministic
---

# Artifact 页签与复制

## 前置条件

- 运行 `pnpm qa:web:scenario chat-artifacts`。
- 使用新的 Browser 标签页。

## 操作

1. 输入“测试 Artifact”并发送。
2. 在“摘要”和“数据”间切换。
3. 点击“复制”。

## 预期

- 默认显示摘要内容，切换后显示 JSON 内容。
- 活动页签样式变化，复制动作不产生 Console error。

## 证据

- 两个页签状态截图。
- 复制后的 Console 状态；具备权限时核对剪贴板。
