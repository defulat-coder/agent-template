---
id: WEB-QA-010
priority: P0
route: /agent
scenario: health-ok
mode: deterministic
---

# Prompt 必填校验

## 前置条件

- 打开新的 Browser 标签页并进入 `/agent`。

## 操作

1. 保持 Prompt 为空。
2. 点击“发送给 Agent”。

## 预期

- 页面显示“请输入 Agent 请求。”。
- 不产生 Agent run 事件。
- 主按钮显示“重试”，页面不进入运行中状态。

## 证据

- 校验错误与空运行事件区域截图。
- Console 无未处理错误。
