# 集中 Health display locality

Status: needs-info
Strength: Speculative
Source: architecture review, 2026-07-02

## 当前结论

- Health 展示映射只有首页一个真实调用方。
- Web QA fixture 是测试 adapter，不是第二个 display 使用点。
- 当前抽取共享 display module 没有 leverage，deletion test 不成立。

## 重新打开条件

- 出现第二个真实 Health 页面或展示调用方。
- 多个测试开始重复维护同一套 Health panel 映射。
- UI 状态转换复杂度明显增长。
