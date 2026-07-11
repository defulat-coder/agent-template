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

## `skills@1.5.16` 根目录 Skill 附属文件缺陷

- 上游把 `SKILL.md` 放在仓库根目录且同时提供 `references/`、`scripts/` 等附属文件时，该版本可能只安装 `SKILL.md`。
- 安装或更新后检查 `SKILL.md` 的本地相对引用；缺失引用必须显式失败，不能把“可发现”当作安装完整。
- 已确认缺陷时，先把同一上游 commit 克隆到临时目录，再通过项目级 `npx skills add <local-clone> --agent codex claude-code -y` 完整复制；随后仅把锁项来源恢复为原 GitHub 来源，保留完整目录的 `computedHash`。
- `npx skills update` 可能再次触发该缺陷；更新后重复相对引用与锁项校验。CLI 升级后先复测，上游修复后删除本节 workaround。
