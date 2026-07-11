---
id: WEB-QA-060
priority: P1
route: /
scenario: health-degraded
mode: deterministic
---

# 首页健康降级

## 前置条件

- 运行 `pnpm qa:web:scenario health-degraded`。
- 使用新的 Browser 标签页，避免 Next.js revalidate 缓存。

## 操作

1. 打开首页并刷新一次。
2. 检查三个健康状态面板。

## 预期

- 页面明确显示 degraded/error/unavailable，不显示为正常。
- 页面仍可进入 Agent 控制台。

## 证据

- 降级状态截图。
- `/health` Response。
