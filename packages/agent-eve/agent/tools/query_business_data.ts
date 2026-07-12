import { defineDynamic, defineTool } from "eve/tools";
import {
  createEveSemanticQueryRuntime,
  EveSemanticQueryToolInputSchema,
  isEveSemanticQueryEnabled,
} from "../lib/semantic-query";

export default defineDynamic({
  events: {
    "session.started": () =>
      isEveSemanticQueryEnabled()
        ? defineTool({
            description:
              "将业务问题解析为受治理的语义查询；仅执行认证查询契约，并返回口径、限制与可追溯结果。不要提交 SQL、表名、列名、身份或权限信息。",
            inputSchema: EveSemanticQueryToolInputSchema,
            async execute(input, ctx) {
              const runtime = createEveSemanticQueryRuntime();
              if (!runtime) {
                throw new Error(
                  "The selected Toolbox capability profile does not enable business semantic catalogs",
                );
              }
              return runtime.query(input, { signal: ctx.abortSignal });
            },
          })
        : null,
  },
});
