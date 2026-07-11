---
id: WEB-QA-070
priority: P2
route: /agent
scenario: chat-completed
mode: deterministic
---

# 响应式与基础可访问性

## 前置条件

- 运行 `pnpm qa:web:scenario chat-completed`。
- 准备 375px 与 1440px 两种视口。

## 操作

1. 分别打开两种视口的 `/agent`。
2. 只使用键盘聚焦 Prompt、发送和取消按钮。
3. 提交一次请求并检查状态播报节点。

## 预期

- 页面无横向溢出，按钮和文本不互相遮挡。
- Tab 顺序与视觉顺序一致，textarea 有可访问名称。
- 运行状态通过 `aria-live` 更新。

## 证据

- 两种视口截图。
- DOM 中 label、button name 和 `aria-live` 属性。
