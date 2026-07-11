# 项目 ZRead Wiki

本目录是项目 Wiki 生成闭环的唯一入口：

- `config/`：可组合的项目级 ZRead 配置；
- `scripts/`：隔离生成、产物校验和原子发布脚本；
- `wiki/`：生成后提交到仓库并由 Web `/docs` 构建读取的 Wiki。

## 项目内 CLI

`zread_cli` 是根 `package.json` 的开发依赖，由 `pnpm-lock.yaml` 固定实际版本。使用 `pnpm exec zread version --stdio` 可验证本项目安装的 CLI；生成脚本只执行 `node_modules/.bin/zread`，不会回退到全局命令。

## 多文件配置

`config/index.yaml` 按声明顺序合并多个 YAML 片段，后面的字段覆盖前面的同名字段，未覆盖的嵌套字段会保留。当前拆分为：

1. `language.yaml`：界面和文档语言；
2. `generation.yaml`：并发数和重试次数（当前最大并发数为 10）；
3. `provider.kimi.yaml`：Kimi Code 的 OpenAI-compatible provider、model 和 BaseURL。

新增配置片段时，先创建不含密钥的 `.yaml` 文件，再加入 `index.yaml`。片段只允许当前目录下的安全文件名，重复、目录穿越、未知字段和 `llm.api_key` 都会使生成显式失败。

ZRead 原生只读取 `~/.zread/config.yaml`。项目脚本会合并上述片段，从现有 `.env` 或 CI Secret 注入 API Key，并把完整运行配置写入权限为 `600` 的隔离临时 HOME；配置和密钥不会传给子进程环境，也不会写入仓库产物。

Provider 按完整 profile 选择，禁止把不同变量族的 Key、model 和 BaseURL 交叉拼接：

- 只设置 `ZREAD_LLM_API_KEY` 时，使用项目 `provider.kimi.yaml` 的 model 和 BaseURL；若设置 `ZREAD_LLM_MODEL` 或 `ZREAD_LLM_BASE_URL` 覆盖，则三个 `ZREAD_LLM_*` 必须同时提供；
- `OPENAI_API_KEY`、`OPENAI_MODEL`、`OPENAI_BASE_URL` 必须同时提供；
- 复用现有 Kimi 时，`ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL`、`ANTHROPIC_BASE_URL` 必须同时提供，且地址必须是 Kimi Coding；
- 同时出现多个 profile 会显式失败。

## 生成与验证

```bash
pnpm docs:zread:test
pnpm docs:zread:typecheck
pnpm docs:zread:update
pnpm --filter @agent-template/web build
```

`docs:zread:update` 会把当前已提交版本克隆到隔离目录，调用 Kimi 生成全部页面，校验 JSONL 终态、写入边界、manifest、Markdown 文件、路径安全以及 stdout、stderr、ZRead log 和生成内容中没有 provider credential 后，仅把当前版本发布到 `.zread/wiki/`。该命令会发送仓库源码上下文并消耗模型额度，必须由有权限的人显式执行。

发布 adapter 会把 ZRead vendor manifest 规范化成稳定的项目契约：`current` 只保存版本 ID，缺失的 `group` 使用 `section`，`level` 统一为字符串；同时从 Markdown 引用生成 canonical `sources.json`，验证源码文件、路径和起始行，超出文件末尾的结束行会收敛到真实行数。Web 和其他消费者只读取这些 canonical indexes，不兼容 vendor 的临时格式差异，也不在消费端重新推导源码 allowlist。

Web 构建会读取当前版本的 `sources.json`，并把其中的源码静态生成为 `/docs/source/*` 页面。源码页与 Wiki 一起进入部署产物，不依赖 GitHub 等远端代码托管服务；未进入 canonical index 的文件、目录穿越路径、`.env` 和环境密钥文件不会暴露。非标准构建目录可用 `ZREAD_WIKI_ROOT` 和 `ZREAD_SOURCE_ROOT` 分别指定 Wiki 与仓库源码根目录。
