# 统一 Agent Chat SSE wire protocol

Status: ready-for-agent
Strength: Strong
Source: architecture review, 2026-07-11

## 问题

- protocol 名称、event envelope、编码和解析分散在 API、Web、Web QA adapter 与 QA contract tests。
- 删除任一局部实现都会把同一协议知识推回其他调用方，deletion test 成立。

## 推荐方案

- 在 `@agent-template/shared` 定义共享 event envelope 与编解码 interface。
- API、Web 和 Web QA adapter 只通过该 interface 生产或消费 SSE。
- 增加跨生产 adapter 与 QA adapter 的 contract tests，锁定 wire protocol。

## 完成条件

- API、Web 与 Web QA 不再各自声明协议名称、envelope 或编解码规则。
- shared contract tests 覆盖合法事件、非法事件和流结束行为。
