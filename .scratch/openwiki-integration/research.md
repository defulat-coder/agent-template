# OpenWiki 集成可行性研究

> 调研日期：2026-07-11
>
> 调研对象：[`langchain-ai/openwiki`](https://github.com/langchain-ai/openwiki) `0.1.1`
>
> 范围：仅使用 OpenWiki 官方仓库、README、发布页、源码、package manifest、CI 示例与许可证等第一方资料。

## 结论

**可以集成，而且适合用来生成和持续维护本项目的仓库文档；但集成形态应是“离线/CI 文档生成器 + 本项目 Next.js 原生文档页面”，不是把 OpenWiki 当成一个可嵌入的 Web 服务。**

OpenWiki 当前是一个 Node.js CLI：在目标仓库执行 `openwiki code --init` 或 `openwiki code --update --print`，让 DeepAgents 基于源码、现有文档和 Git 变化生成 `openwiki/*.md`。官方 npm manifest 只声明了 `openwiki` 二进制，没有 `main`/`exports` 公共库入口；仓库也没有 Web Server、REST/GraphQL API、Dockerfile 或可 iframe 的 Web UI。[README](https://github.com/langchain-ai/openwiki/blob/0.1.1/README.md#L28-L60) · [package.json](https://github.com/langchain-ai/openwiki/blob/0.1.1/package.json#L1-L17)

对当前 `agent-template`，建议采用：

1. OpenWiki 只在开发机和 GitHub Actions 中运行，生成并提交根目录 `openwiki/` Markdown。
2. `apps/web` 增加 `/docs` 和 `/docs/[...slug]` App Router 页面，由服务端安全读取 `openwiki/` 下的 Markdown。
3. 文档页使用项目已有 `react-markdown` + `remark-gfm` 依赖，但保留独立 `DocsMarkdown`，不要把 Agent message 与文档语义塞进一个带模式参数的通用 renderer。
4. 不运行独立 OpenWiki 容器，不做反向代理，也不使用 iframe。
5. 自动更新只创建 PR，必须经过人工/门禁审阅后合并，避免 AI 文档错误直接上线。

`openwiki/` 应被视为从源码、`CONTEXT.md`、`docs/adr/` 和适用范围内 `AGENTS.md` 派生的只读投影，而不是新的架构或产品事实来源；发生冲突时仍以上述源材料为准。

综合判断：**技术兼容性高，产品集成成本低到中等；生产风险主要不在前端，而在生成质量、源码外发、凭据治理和 OpenWiki 仍处早期版本。适合先做受控 POC，不建议立刻把生成任务放进线上请求链路。**

## 1. OpenWiki 实际是什么

### 技术栈

- TypeScript ESM CLI，要求 Node.js `>=20`；当前版本 `0.1.1`。[package.json](https://github.com/langchain-ai/openwiki/blob/0.1.1/package.json#L1-L12)
- 终端 UI 使用 Ink + React 18；Agent 层使用 LangChain、DeepAgents，并接入 OpenAI、Anthropic、OpenRouter 等模型 SDK；校验使用 Zod，测试使用 Vitest。[package.json](https://github.com/langchain-ai/openwiki/blob/0.1.1/package.json#L43-L70)
- SQLite checkpoint 通过 `@langchain/langgraph-checkpoint-sqlite`/`better-sqlite3` 实现；这带来原生依赖安装风险，官方特别提示 Windows/Bun 路径可能需要 C++ Build Tools。[package.json](https://github.com/langchain-ai/openwiki/blob/0.1.1/package.json#L43-L58) · [README](https://github.com/langchain-ai/openwiki/blob/0.1.1/README.md#L13-L26)

当前项目根 Node.js 24 满足 OpenWiki 的 `>=20` 要求；OpenWiki 的 React 18 仅服务于它自己的 CLI，不应进入 `apps/web` 的 React 19 渲染树。因此应把它视为构建/维护工具，而不是 `@agent-template/agent` 的新 runtime。

### 两种模式

- `personal`：把 Gmail、Notion、X、Web Search、本地 Git 仓库等来源综合成 `~/.openwiki/wiki`，属于个人知识库。
- `code`：针对当前代码仓库生成 `openwiki/`，这是本项目需要的模式。[README](https://github.com/langchain-ai/openwiki/blob/0.1.1/README.md#L28-L49)

本次需求只应接入 `code` 模式。Personal connectors 会显著扩大隐私、OAuth 和数据治理范围，对“展示项目文档”没有必要。

## 2. 文档生成与更新流程

### 首次生成

官方流程是安装 CLI 后在仓库根目录运行：

```bash
npm install -g openwiki@0.1.1
openwiki code --init
```

首次交互运行会选择 inference provider、模型和 API key，可选配置 LangSmith tracing；本地配置与密钥写入 `~/.openwiki/.env`。[README](https://github.com/langchain-ai/openwiki/blob/0.1.1/README.md#L145-L153)

Agent 会收集 Git 状态/历史，使用 DeepAgents `LocalShellBackend` 检查仓库，生成以 `openwiki/quickstart.md` 为入口的 Markdown 文档；非聊天运行前后会对文档目录做内容快照，只有真正发生变化才更新元数据。[Agent workflow](https://github.com/langchain-ai/openwiki/blob/0.1.1/openwiki/agent/workflow.md) · [agent runtime](https://github.com/langchain-ai/openwiki/blob/0.1.1/src/agent/index.ts#L148-L255)

### 持续更新

非交互更新命令为：

```bash
openwiki code --update --print
```

即使 `openwiki/` 尚不存在，`--update` 在 CI 环境变量齐全时也可完成首次生成。官方 GitHub Actions 示例每天运行一次，并通过 `peter-evans/create-pull-request` 提交 `openwiki/`、`AGENTS.md`、`CLAUDE.md` 和 workflow 变更。[README](https://github.com/langchain-ai/openwiki/blob/0.1.1/README.md#L51-L60) · [GitHub Actions 示例](https://github.com/langchain-ai/openwiki/blob/0.1.1/examples/openwiki-update.yml#L1-L54)

OpenWiki 使用 `openwiki/.last-update.json` 记录上次成功更新的时间、命令、Git HEAD 和模型，后续按 Git 增量决定要刷新哪些页面；没有文档变化时不会只刷新时间戳。[update implementation](https://github.com/langchain-ai/openwiki/blob/0.1.1/src/agent/utils.ts)

### 它还会修改哪些文件

每次 code 模式初始化/更新都会：

- 创建或覆盖 `.github/workflows/openwiki-update.yml`；
- 在根 `AGENTS.md` 与 `CLAUDE.md` 中新增或刷新 `<!-- OPENWIKI:START -->...<!-- OPENWIKI:END -->` 区块；已有区块外的内容按实现保留。[code-mode implementation](https://github.com/langchain-ai/openwiki/blob/0.1.1/src/code-mode.ts#L5-L67)

这对当前项目尤其需要审查：本仓 `CLAUDE.md` 是指向 `AGENTS.md` 的软链接，OpenWiki 会并行写这两个路径。内容理论上相同，但首次 POC 后必须检查软链接、根协作规则和 workflow diff，不能把生成器的仓库级副作用当作纯 `openwiki/` 写入。

## 3. 数据持久化、API 与认证

| 能力 | OpenWiki 当前行为 | 对本项目的含义 |
| --- | --- | --- |
| 生成文档 | `openwiki/*.md`，另有 `.last-update.json` | Git 是文档版本与发布的事实来源；无需 PostgreSQL |
| Chat checkpoint | Chat 使用 `~/.openwiki/openwiki.sqlite`；init/update 在 `0.1.1` 中使用内存 checkpoint | 文档生成不需要常驻 SQLite 服务，也不应接入现有 Prisma 数据库 |
| 配置/凭据 | `~/.openwiki/.env`；CI 由 secrets 注入 | 不应复制到应用 `.env`，更不能暴露给浏览器 |
| HTTP/API | 没有对外 HTTP 服务或文档 API；npm 包只公开 CLI binary | 生成任务只能通过 CLI/子进程或 CI 编排，不应从前端直接调用 |
| 最终用户认证 | 没有文档站用户、角色或 ACL 模型 | `/docs` 是否公开、谁能访问，必须由 `apps/web` 自己决定和实现 |
| Provider 认证 | API key，或 OpenAI ChatGPT OAuth；另有 connector OAuth | 这些只服务生成器，不等于本项目登录态 |
| 可观测性 | 可选 LangSmith tracing | 若启用，要把 trace 中可能包含的代码/文档内容纳入数据治理 |

Checkpoint 的当前实现明确区分：chat 写 `~/.openwiki/openwiki.sqlite`，而 init/update 使用 `:memory:`，生成完成后才按文档快照写元数据。[checkpoint source](https://github.com/langchain-ai/openwiki/blob/0.1.1/src/agent/index.ts#L257-L338)

模型支持 OpenAI、OpenRouter、Anthropic、Fireworks、Baseten、OpenAI-compatible endpoint，以及 ChatGPT 登录；凭据可来自进程环境或 `~/.openwiki/.env`。[README](https://github.com/langchain-ai/openwiki/blob/0.1.1/README.md#L189-L249)

## 4. 前端挂载方案

### 推荐：Next.js 原生 Markdown 路由

建议的请求路径如下：

```text
开发机 / GitHub Actions
  -> openwiki code --update --print
  -> 仓库根 openwiki/**/*.md
  -> PR 审阅并合并
  -> Next.js /docs/[...slug]
  -> 服务端读取 + react-markdown/remark-gfm
  -> 浏览器查看
```

当前 `apps/web` 已经依赖 `react-markdown@^10.1.0` 与 `remark-gfm@^4.0.1`，并已有 `AgentMarkdown` 组件，所以无需引入另一套 Markdown 运行时。但 `AgentMarkdown` 的外链、新窗口和聊天排版属于 Agent message 语义；文档页应保留独立 `DocsMarkdown`，避免为少量依赖复用创建带大量模式参数的浅层抽象。

路由实现需满足：

- 只允许读取仓库根 `openwiki/` 内的 `.md`，对 slug 做规范化并阻止 `..`/绝对路径逃逸；
- 用一个 server-only 深模块集中拥有根目录定位、目录索引、slug 规范化、路径逃逸防护、读取失败和部署资产定位；页面只负责组合。当前只有文件系统这一种真实实现，不要预设 `DocsSource` adapter seam；
- `/docs` 重定向或渲染 `openwiki/quickstart.md`；
- 将 `./architecture/foo.md` 等相对链接转换为 `/docs/architecture/foo`；
- 未找到页面返回 404，不做兜底伪造；
- 构建/运行镜像必须包含 `openwiki/`。当前根 Dockerfile 的 `COPY . .` 会带入它，但若以后切到 Next standalone 或缩小 build context，需要显式加入文档资产；
- 若文档可能包含内部架构、接口、环境变量名或商业规则，`/docs` 应沿用宿主应用访问控制并设置合适缓存，而不是默认公开。

### iframe 与反向代理

**iframe：不推荐，也没有现成目标。** OpenWiki 没有 Web UI，无法直接 iframe。可以 iframe 本项目自己做的 `/docs`，但这比直接路由多一层焦点、导航、可访问性和高度同步问题，没有收益。

**反向代理：不需要。** 没有 OpenWiki HTTP 服务可代理。若自行 fork 并添加服务端，会把一个简单的 Markdown 构建链扩张成额外常驻服务、认证面和运维面。

## 5. 与 agent-template 的适配判断

| 维度 | 判断 | 说明 |
| --- | --- | --- |
| Node/pnpm | 适配 | 本项目 Node 24，高于 OpenWiki `>=20`；建议生成器与应用 runtime 隔离 |
| Monorepo | 适配 | 从仓库根执行即可分析 `apps/`、`packages/` 和根文档 |
| Next.js 前端 | 高度适配 | 已有 App Router、React Markdown 和 GFM 渲染依赖 |
| Agent runtime 边界 | 不应耦合 | OpenWiki 是外部文档工具，不属于 `AGENT_RUNTIME=claude|eve` 抽象 |
| 数据库/队列 | 无需集成 | 输出是版本化 Markdown，生成任务不应走 PostgreSQL/Redis/BullMQ |
| Docker | 展示可适配 | 当前镜像复制全仓；不要在应用容器启动时安装/运行 OpenWiki |
| 访问控制 | 宿主负责 | OpenWiki 没有文档 ACL，Web 路由必须自行决定公开或登录后访问 |
| CI | 可适配但需改造 | 官方 workflow 会写 PR，但安装未固定版本，且会覆盖指定 workflow 文件 |

## 6. 成熟度、许可证与主要风险

### 许可证

OpenWiki 使用 MIT License，可使用、复制、修改、分发和再许可；分发其软件或实质部分时需保留版权和许可声明。[LICENSE](https://github.com/langchain-ai/openwiki/blob/0.1.1/LICENSE#L1-L20)

仅在 CI 中调用 CLI、把它生成的 Markdown 放入本项目，通常不需要把 OpenWiki 源码并入产品；若以后 fork、打包或分发其代码/二进制，应保留许可证并让法务按实际分发方式确认。

### 成熟度

截至调研日，GitHub 展示约 10.4k stars、97 commits、6 个 releases，但最新稳定标签仍是 `0.1.1`，发布于 2026-07-11。[仓库主页](https://github.com/langchain-ai/openwiki) · [0.1.1 release](https://github.com/langchain-ai/openwiki/releases/tag/0.1.1)

社区热度很高，但版本号和发布历史都说明 API/行为仍可能快速变化。`0.1.1` 本身刚加入“限制 init/update 写入 openwiki”“敏感 key 脱敏”“init/update checkpoint 改为临时”等修复，也说明安全与边界仍在快速收敛。[0.1.1 change log](https://github.com/langchain-ai/openwiki/releases/tag/0.1.1#whats-changed)

### 风险清单

1. **AI 生成质量**：文档可能遗漏、过时或错误。必须通过 PR 和人工审阅进入主线，不能把“成功退出”当作内容正确。
2. **源码/上下文外发**：Agent 会把 Git 上下文和读取到的源码证据交给所选模型。私有代码使用前需要确认 provider、区域、保留策略和 LangSmith tracing 策略。
3. **写入边界并非完整 OS sandbox**：`0.1.1` 的 `OpenWikiLocalShellBackend` 对 Agent 的 `write`/`edit` 拒绝 `openwiki/` 外路径，但它继承的 shell execute 并未在这个 guard 类里覆盖；同时 code setup 本身会主动写 workflow、`AGENTS.md`、`CLAUDE.md`。应在隔离分支运行并审查全仓 diff。[docs-only backend](https://github.com/langchain-ai/openwiki/blob/0.1.1/src/agent/docs-only-backend.ts#L15-L70) · [code setup](https://github.com/langchain-ai/openwiki/blob/0.1.1/src/code-mode.ts#L13-L67)
4. **供应链可重复性**：官方 workflow 使用 `npm install --global openwiki`，没有固定版本。生产仓应固定 `0.1.1` 或经验证的后续版本，并固定 CI action SHA。[workflow](https://github.com/langchain-ai/openwiki/blob/0.1.1/examples/openwiki-update.yml#L21-L41)
5. **原生依赖**：`better-sqlite3` 可能在部分平台触发编译。把生成放在开发/CI 环境，可避免污染 Web 生产镜像。
6. **AGENTS/CLAUDE 副作用**：当前仓 `CLAUDE.md -> AGENTS.md`，需要专门验证 OpenWiki 并行维护两个路径时不会破坏软链接或重复区块。
7. **文档泄露**：生成内容可能把内部接口、边界和环境变量名组织得更易读；发布 `/docs` 前必须决定是内部文档还是公开文档。
8. **生成与展示解耦**：线上请求绝不能实时触发 OpenWiki。否则会引入模型成本、分钟级延迟、写文件竞争、凭据和任意源码读取风险。
9. **事实来源漂移**：生成 Wiki 只能解释源代码和权威文档，不能反向覆盖 ADR、领域语言或协作规则；CI 应把它当作可删除、可再生的投影。

## 7. 推荐落地顺序

### 阶段 A：受控 POC

1. 在一次性 checkout 或隔离 worktree 中固定 `openwiki@0.1.1`，先执行一次 `openwiki code --init`，不要让 CLI 直接污染日常工作区。
2. 全量审查 `openwiki/`、`.github/workflows/openwiki-update.yml`、`AGENTS.md`、`CLAUDE.md` 及软链接状态；只把校验后的 `openwiki/` 发布回主工作区。
3. 评估生成页数、中文质量、事实错误、模型 token 成本与耗时；不合格就停止，不先做前端。
4. 明确 provider 与 LangSmith 数据策略；默认不开 connector，不把个人数据源接入 code docs。

### 阶段 B：只读文档页面

1. 新建受控的 server-only 文档 catalog 深模块，对页面提供最小的目录与读取接口。
2. 新建 `/docs`、`/docs/[...slug]`，复用现有 Markdown 依赖。
3. 添加路径穿越、404、相对链接、标题/代码块/表格等测试。
4. 运行 Web 的 lint、test、typecheck、build，并在浏览器验证桌面与移动端页面。

### 阶段 C：持续更新

1. 基于官方 workflow 手工整合，在一次性 checkout 内执行 OpenWiki，只发布 `openwiki/`；若 CLI 出现未列入预期的仓库级写入则直接失败。
2. 固定 OpenWiki 版本，使用 GitHub secrets，保持“创建 PR、不自动合并”。
3. PR 门禁至少运行生成写入白名单、Web build 和 Markdown 链接/路径检查。
4. 版本升级单独提 PR，复核 release notes、生成 diff 和写入边界。

## 最终建议

建议落地，但定位应严格限定为：

> **OpenWiki 负责生成 Git 内的项目 Markdown；agent-template 自己负责文档展示、认证、导航、缓存和部署。**

这条边界能最大化利用 OpenWiki 的代码理解与增量维护能力，同时避免引入一个并不存在的 Web 服务/API。第一阶段只做生成质量 POC；确认文档确实有价值后，再实现 Next.js 原生 `/docs` 页面。
