# 收拢 Queue runtime knowledge

Status: needs-info
Strength: Worth exploring
Source: architecture review, 2026-07-02

## 当前结论

- API queue adapter 与 Worker adapter 是仅有的两个生产装配点。
- `createBullMqConnectionOptions` 已集中 Redis URL parsing。
- 当前新增 queue runtime module 会形成 shallow module；deletion test 不成立。

## 重新打开条件

- 新增第三个 queue consumer。
- queue option 规则继续增长。
- Redis/BullMQ adapter 出现测试替换需求。
