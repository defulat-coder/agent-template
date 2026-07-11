# Skills 管理与故障处理

## 项目级工作流

```bash
npx skills find <query>
npx skills add <source> --agent codex claude-code
npx skills list
npx skills update [skills...] -p
npx skills remove [skills]
```

- 不加 `-g`；默认同时支持 Codex 与 Claude Code。
- 增删改后验证 `.agents/skills/*` 与 `skills-lock.json` 双向一致。
- Skill 自带 Codex hook 时合并到 `.codex/hooks.json`，删除 Skill 时同步移除失效 hook。

## `skills@1.5.16` 项目级删除缺陷

- 该版本的 `remove` 会删除目录和软链接，但可能遗留同名项目锁项。
- 先执行正常删除；确认 CLI 版本及残留锁项后，只清理被删 Skill 的同名锁项并验证 JSON 与双向一致性。
- CLI 升级后先复测；上游修复后删除本节 workaround。
