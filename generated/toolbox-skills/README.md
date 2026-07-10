# Toolbox 官方原始 Skills

这里保存 `@toolbox-sdk/server` 的 `skills-generate` 命令生成的原始完整产物，方便检查 Google Toolbox 的标准 Skill 结构。

每个业务 Skill 包含：

- `SKILL.md`：官方生成的使用说明和 Tool 参数。
- `assets/tools.yaml`：该 Toolset 对应的 Toolbox 配置。
- `scripts/*.js`：官方生成的直接调用脚本。

根目录 `manifest.json` 记录生成器管理的 Skill 名称，用于安全清理已删除或重命名的 raw、Claude 和 Eve 产物；不会删除其他手工 Skill。

这些原始脚本只用于产物检查和本地诊断，不是项目 Agent 的生产执行路径。Eve 和 Claude 实际加载的适配版分别位于：

- `packages/agent-eve/agent/skills/`
- `.claude/skills/`

重新生成与检查：

```bash
pnpm skills:generate:toolbox
pnpm skills:check:toolbox
```

不要手工修改业务子目录；生成器会覆盖它们，检查命令会逐字比较官方重新生成结果。
