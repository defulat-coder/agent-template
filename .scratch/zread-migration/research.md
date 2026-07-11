# ZRead 替换 OpenWiki 的可行性研究

> 调研日期：2026-07-11
> 范围：只使用 ZRead、Z.AI、Kimi/Moonshot 的官方站点、官方 GitHub 仓库、官方 Skill 协议和 npm 官方注册表元数据。

## 结论

用户所说的 **ZREID / ZREaD** 对应的正式名称是 **Zread**，命令为 `zread`，npm 包为 `zread_cli`。

Zread **可以替代 OpenWiki 的本地 Wiki 生成核心**，并继续由项目自己的 Next.js `/docs` 页面展示。合适的产品是本地 **Zread CLI**，不是 Zread Cloud/MCP。推荐闭环为：

```text
本地仓库或 CI checkout
  -> 固定版本 Zread CLI + 隔离 HOME
  -> zread generate -y --stdio
  -> .zread/wiki/current + versions/<id>/wiki.json + Markdown
  -> 项目侧校验与原子发布到 wiki/
  -> Next.js /docs 读取 wiki/
  -> workflow_dispatch 创建仅含 wiki/ 的人工审核 PR
```

但现在不建议直接删除 OpenWiki：应先完成一次短期 spike，验证 Kimi Code OpenAI-compatible 接口、无交互 CI 配置和实际 Markdown 质量；同时必须接受或解决 `zread_cli` 为 `UNLICENSED` 预编译软件的许可证风险。

## 1. 产品形态与部署方式

Zread 当前有两条不同产品线，不能混用：

1. **Zread CLI（本次迁移应使用）**
   - 在当前本地项目目录运行，使用 LLM 分析源码并生成结构化 Wiki。
   - 支持 npm、Homebrew、winget 和预编译二进制安装，覆盖 macOS、Linux、Windows。
   - `zread browse` 提供本地阅读器，适合本地预览；生产页面无需部署该阅读器，可直接消费 Markdown。
   - 官方说明与命令：[Zread CLI 官网](https://zread.ai/cli)、[Zread CLI 官方仓库 README](https://github.com/ZreadAI/zread_cli#readme)。

2. **Zread Cloud / Zread MCP（不适合作为本次生成链路）**
   - MCP 是 Z.AI 公有云上的仓库检索、结构浏览和文件读取服务，提供 `search_doc`、`get_repo_structure`、`read_file`。
   - 它没有 Wiki 生成工具，并且官方明确说明当前不提供 enterprise/private deployment。
   - 官方说明：[Zread MCP](https://zread.ai/mcp)。

因此，Zread 的“本地部署”准确含义是：CLI 和产物在项目机器/CI runner 上运行与保存；它不是一套可私有部署的完整 SaaS 服务。

## 2. 私有/本地仓库、Markdown 与静态导出

可以从本地目录生成，因而不依赖仓库必须公开在 GitHub：

- `zread generate` 以当前工作目录为源码输入。
- 官方 CLI 页面明确将 local repository、internal/private codebase 作为适用场景。
- 产物位于项目的 `.zread/wiki/`，官方说明生成的文档不会上传到 Zread 服务器。
- 证据：[Zread CLI 官网](https://zread.ai/cli)、[官方 README 的配置与 FAQ](https://github.com/ZreadAI/zread_cli#配置说明)。

官方 Agent Skill 给出了比产品页更精确的磁盘协议：

- `.zread/wiki/current`：当前版本 ID 文本文件；
- `.zread/wiki/versions/<id>/wiki.json`：页面目录，含 slug、title、file、section、group、level；
- `.zread/wiki/versions/<id>/<file>`：实际 Markdown 页面；
- `.zread/wiki/drafts/`：中断生成的草稿，可续跑。

证据：[Zread 官方 Skill](https://github.com/ZreadAI/zread-skill/blob/main/SKILL.md)、[Skill README](https://github.com/ZreadAI/zread-skill#zread-output)。

结论：

- **Markdown 静态 Wiki：支持。** Markdown 和目录 JSON 都是可直接复制、提交和由 Next.js 构建读取的本地文件。
- **HTML 静态站点 export：未发现官方能力。** `zread browse` 是本地阅读器，不是导出静态站点的命令；本项目应保留自己的 `/docs` 前端。
- **私有仓库：CLI 支持。** 不应改用只面向云端检索的 MCP 来完成私仓生成。

## 3. CLI、API、Webhook 与 CI 接口

Zread 有正式的机器自动化接口：

- CLI 命令包括 `generate`、`browse`、`login`、`config`、`update`、`version`。
- 所有命令支持 `--stdio`，使用 stdin/stdout 上的 JSON Lines 双向协议；事件包含完整 ViewModel、`waiting_for`、`done`、`error`。
- 无人值守生成可用 `zread generate -y --stdio`；草稿、失败页面重试/跳过也有协议状态。
- 注意：`zread update` 是更新 CLI 自身，不是重新生成 Wiki。
- 证据：[Zread stdio 官方协议](https://github.com/ZreadAI/zread-skill/blob/main/references/stdio-protocol.md)、[Zread 官方 Skill 的非交互规则](https://github.com/ZreadAI/zread-skill/blob/main/SKILL.md)。

未发现官方提供以下能力：

- Wiki 生成 REST API；
- Wiki 生成 webhook；
- 官方 GitHub Action 或现成 PR 工作流；
- 可私有部署的生成服务 API。

因此 CI 是**可实现但由项目自建**：安装固定版本 CLI，在隔离 HOME 写配置，运行 `generate -y --stdio`，读取版本目录，完成内容校验、原子发布和 PR。Zread MCP 的 SSE/Streamable HTTP 是云端只读检索 API，不能替代该生成过程。

## 4. 模型供应商与数据外发边界

Zread 官方列出的内置供应商包括：智谱 Coding Plan、Z.AI Coding Plan、智谱 BigModel、Z.AI、OpenAI、MoonShot、MiniMax、OpenRouter；也支持任意 OpenAI-compatible 自定义 BaseURL。配置位于 `~/.zread/config.yaml`。证据：[Zread CLI 官方 README](https://github.com/ZreadAI/zread_cli#配置说明)。

对本项目现有 Kimi 配置：

- 当前项目使用的是 Kimi Code 的 Anthropic-compatible 形式，例如 `ANTHROPIC_BASE_URL=https://api.kimi.com/coding/`。
- Zread 官方文档只明确支持 MoonShot 和 OpenAI-compatible 自定义 BaseURL，没有声明可直接复用 Anthropic-compatible 变量。
- Kimi 官方同时提供 OpenAI-compatible 入口 `https://api.kimi.com/coding/v1`，模型 ID 为 `kimi-for-coding`，所以技术上可把同一 Kimi Code Key 改映射到 Zread 的 OpenAI-compatible 配置，而不是继续传 `ANTHROPIC_*`。
- 证据：[Kimi Code 服务端点](https://www.kimi.com/code/docs/)、[Kimi 第三方 Agent 配置](https://www.kimi.com/code/docs/en/third-party-tools/other-coding-agents)。

数据边界必须写清：

- 生成的 Markdown 保存在本地，官方称不会上传到 Zread 服务器。
- 但 `generate` 明确会调用所选 LLM；为生成文档而选取的源码上下文会发送到该模型服务商。
- 若配置 Kimi Code，外发终点是 Kimi；若配置其他云模型，终点是相应供应商；若以后接入真正本地的 OpenAI-compatible 模型，模型请求才可留在内网。
- 官方资料没有足够依据证明 CLI 不存在其他遥测，因此不能把“文档不上 Zread 云”扩大成“所有数据都不出机”。

另一个合规点是 Kimi Code 权益对第三方工具的使用规则。Kimi 官方支持 OpenAI-compatible 接入第三方 coding agent，但 Zread 是否属于订阅权益允许的客户端仍应在正式 CI 使用前确认；不能只凭接口兼容性推断商业授权。

## 5. 对当前闭环的替代程度

| 当前目标                    | Zread 能否承接 | 说明                                                                            |
| --------------------------- | -------------: | ------------------------------------------------------------------------------- |
| 从本地/私有仓生成 Wiki      |             是 | `zread generate` 读取当前目录                                                   |
| 生成 Markdown               |             是 | 版本目录中是 Markdown，目录为 `wiki.json`                                       |
| 前端 `/docs` 直接展示       |             是 | 项目 Next.js 可读 Markdown；无需 `zread browse`                                 |
| 仓内稳定目录                |         需适配 | 原生输出是 `.zread/wiki/versions/<id>`，项目侧发布到 `wiki/`                    |
| 只提交 Wiki 变更            |             是 | 在隔离 clone 生成，再校验并只发布 `wiki/`                                       |
| 手动触发 CI                 |             是 | 自建 `workflow_dispatch` 调用 CLI                                               |
| 自动创建 PR                 |             是 | 继续使用项目现有 PR action；不是 Zread 自带                                     |
| 复用现有 Kimi               |         有条件 | 改用 OpenAI-compatible endpoint，并验证权益与实际调用                           |
| 自定义生成指令/固定目录结构 |         未证实 | 官方 CLI/stdio 文档没有公开等价于 `openwiki/INSTRUCTIONS.md` 的 prompt contract |
| 官方 webhook/REST 生成 API  |             否 | 只有 CLI/stdio；MCP 不是生成 API                                                |

所以它可以替换“生成引擎”，但项目必须保留并改造“安全适配层、产物校验、稳定发布目录、Next 展示、PR 自动化”。它不是把 OpenWiki 包名替换成另一个包名就结束。

## 6. 推荐迁移方案

### 阶段 A：先做不破坏现状的 spike

1. 把 `zread_cli@0.2.13` 安装为项目依赖，并在临时 clone 和隔离 HOME 中运行项目本地二进制。
2. 将现有 Kimi Key 映射为：
   - provider：OpenAI-compatible；
   - BaseURL：`https://api.kimi.com/coding/v1`；
   - model：`kimi-for-coding`。
3. 使用 `zread generate -y --stdio` 跑完整仓库。
4. 验证：
   - `current` 能正确解析版本；
   - `wiki.json` 的 schema 和 Markdown 文件完整；
   - 相对链接、图片、标题、中文输出可被现有 React Markdown 渲染；
   - CI 能无浏览器登录、无 TTY、从 secret 注入配置；
   - 失败、草稿续跑和退出码可可靠识别。

### 阶段 B：替换生成适配层

1. 在 `.zread/scripts/update.ts` 维护生成适配器，删除对 OpenWiki npm 包和 `runOpenWikiAgent` 的依赖。
2. 保留现有隔离 clone、环境变量最小化、路径 allowlist、内容门禁和原子发布机制。
3. 由 `.zread/config/index.yaml` 组合多个无密钥配置片段，在隔离 HOME 中生成 ZRead 原生单文件配置。
4. 生成后读取 `.zread/wiki/current`，校验并解析 `versions/<id>/wiki.json`，将其引用的 Markdown 原子发布到仓内 `.zread/wiki/`。
5. 不提交历史版本和草稿，避免仓库持续膨胀。
6. 若确实需要历史版本，应先明确保留策略，而不是默认提交全部 `versions/`。

### 阶段 C：前端和 CI 切换

1. `/docs` URL 保持不变；把 catalog/root/link helper 从 `openwiki` 命名迁移为 `wiki`，优先使用 `wiki.json` 的目录顺序和分组。
2. 将脚本改为 `docs:zread:test`、`docs:zread:update`。
3. 将 workflow 改为 `zread-update.yml`，仅保留 `workflow_dispatch`，PR `add-paths` 仅允许 `wiki/`。
4. Kimi Secret 不落盘进仓库；只写入 runner 的隔离 HOME，任务结束清除。
5. 真实运行、浏览器检查 `/docs`、全仓门禁通过后，再删除 `scripts/openwiki/`、`openwiki/INSTRUCTIONS.md` 和 OpenWiki 专属测试。

## 明确阻塞项

1. **许可证/供应链**：截至调研时 npm `zread_cli@0.2.13` 元数据为 `license: UNLICENSED`；官方 GitHub 仓库只有 README，没有实现源码或 LICENSE，npm 通过平台 optionalDependencies 分发预编译二进制。不能称为开源，也不应在未审条款时内嵌或再分发。证据：[npm 官方注册表元数据](https://registry.npmjs.org/zread_cli/latest)、[Zread CLI 官方仓库](https://github.com/ZreadAI/zread_cli)。
2. **Kimi 商业授权**：接口技术兼容不等于 Kimi Code 订阅允许 Zread 在 CI 中长期使用，需确认权益条款。
3. **CI 非交互配置**：官方给出 `--stdio`，但没有现成 GitHub Action；需要 spike 确定 `~/.zread/config.yaml` 的稳定写法和 secret 注入。
4. **生成约束能力**：未发现与 OpenWiki `INSTRUCTIONS.md` 等价的自定义指令接口；中文、页面规划、必须包含/禁止包含的事实要靠实测和项目侧门禁。
5. **全量再生成噪声**：官方支持历史版本、草稿和续跑，但没有公开“按 git diff 增量更新并保持页面稳定”的契约；需要评估每次 PR 的 diff 稳定性与 token 成本。
6. **产物兼容性**：必须用真实仓库检查链接、图片、diagram、目录层级和 Markdown 方言，再决定 frontend 直接读版本目录还是发布成规范化 `wiki/`。

## 决策建议

建议**有条件迁移**：先保留当前分支的 OpenWiki 实现，完成 Zread + Kimi 的隔离 spike；只要 spike 同时通过“非交互生成、Markdown 可渲染、PR diff 可控、许可证/权益可接受”四个门槛，就切换到 Zread 并删除 OpenWiki。任一门槛未通过，都不应先拆掉已有闭环。
