import {
  BusinessSemanticCatalogSchema,
  type BusinessSemanticCatalog,
} from "@agent-template/semantic-query";

export const toolboxBusinessSemanticCatalogs = Object.freeze(
  Object.fromEntries(
    Object.entries({
      "ecommerce.yaml": {
        kind: "business-semantic-catalog",
        name: "ecommerce-retail-example",
        version: 1,
        databaseSchema: "ecommerce_fixture",
        timeZone: "UTC",
        description:
          "用于合成电商 fixture 的智能问数示例。定义业务术语、指标、维度、取值和受控 Toolbox 查询路径；不是任何真实业务的数据字典。",
        owners: [
          {
            role: "电商数据负责人",
            responsibility: "审核指标口径、维度值和变更",
          },
        ],
        governance: {
          sourceOfTruth: "apps/toolbox/tools.yaml",
          queryPolicy: [
            "先将自然语言术语解析为本目录中的 canonical id。",
            "只调用目录引用的受控 Toolbox Tool，不生成或执行任意 SQL。",
            "遇到 ambiguity 标记的术语时先澄清，不以猜测替代业务口径。",
            "每个答案都说明指标、时间窗、维度、纳入规则和限制。",
          ],
          productionSecurity: [
            "组织和角色范围必须由可信身份注入，不得由模型提供。",
            "聚合查询使用最小权限只读数据库角色；明细查询不得返回 PII。",
            "每个指标需与权威 BI 或财务口径定期对账。",
          ],
        },
        entities: [
          {
            id: "ecommerce_order",
            labels: ["订单", "交易单"],
            grain: "一笔电商订单",
            source: "EcommerceOrder",
            timeFields: [
              {
                id: "payment_date",
                field: "EcommerceOrder.paidAt",
                labels: ["付款日期", "成交日期", "支付日期"],
              },
              {
                id: "order_date",
                field: "EcommerceOrder.placedAt",
                labels: ["下单日期", "订单日期"],
              },
            ],
          },
          {
            id: "ecommerce_order_item",
            labels: ["订单项", "商品明细"],
            grain: "一笔订单中的一个商品项",
            source: "EcommerceOrderItem",
            relationship: "EcommerceOrderItem.orderId -> EcommerceOrder.id",
          },
          {
            id: "ecommerce_customer",
            labels: ["客户", "买家"],
            grain: "一个合成客户",
            source: "EcommerceCustomer",
            relationship: "EcommerceOrder.customerId -> EcommerceCustomer.id",
          },
        ],
        metrics: [
          {
            id: "gross_sales",
            labels: ["GMV", "销售额", "销售总额", "成交额"],
            resultField: "grossSales",
            definition:
              "已结算订单 paidTotal 之和，包含后续已退款订单的原支付金额。",
            eligibility: "status IN (PAID, FULFILLED, REFUNDED)",
            timeField: "EcommerceOrder.paidAt",
            tools: [
              "summarize-ecommerce-sales-by-day",
              "summarize-ecommerce-sales-by-channel",
              "summarize_sales_by_region",
              "summarize_sales_by_customer_segment",
            ],
          },
          {
            id: "refund_amount",
            labels: ["退款额", "退款金额"],
            resultField: "refundAmount",
            definition: "已结算订单 refundedTotal 之和，支持全额和部分退款。",
            eligibility: "status IN (PAID, FULFILLED, REFUNDED)",
            timeField: "EcommerceOrder.paidAt",
            tools: [
              "summarize-ecommerce-sales-by-day",
              "summarize-ecommerce-sales-by-channel",
              "summarize_sales_by_region",
              "summarize_sales_by_customer_segment",
            ],
          },
          {
            id: "net_sales",
            labels: ["净销售额", "净GMV", "退款后销售额"],
            resultField: "netSales",
            definition: "grossSales - refundAmount；不是会计确认收入或利润。",
            eligibility: "status IN (PAID, FULFILLED, REFUNDED)",
            timeField: "EcommerceOrder.paidAt",
            tools: [
              "summarize-ecommerce-sales-by-day",
              "summarize-ecommerce-sales-by-channel",
              "summarize_sales_by_region",
              "summarize_sales_by_customer_segment",
            ],
          },
          {
            id: "average_order_value",
            labels: ["客单价", "AOV", "平均订单金额"],
            resultField: "averageOrderValue",
            definition: "在当前维度内平均单笔 paidTotal - refundedTotal。",
            eligibility: "status IN (PAID, FULFILLED, REFUNDED)",
            timeField: "EcommerceOrder.paidAt",
            tools: [
              "summarize-ecommerce-sales-by-channel",
              "summarize_sales_by_region",
              "summarize_sales_by_customer_segment",
            ],
          },
          {
            id: "paid_order_count",
            labels: ["支付订单数", "成交订单数"],
            resultField: "paidOrderCount",
            definition: "当前时间窗内已结算订单数。",
            eligibility: "status IN (PAID, FULFILLED, REFUNDED)",
            timeField: "EcommerceOrder.paidAt",
            tools: [
              "summarize-ecommerce-sales-by-day",
              "summarize-ecommerce-sales-by-channel",
              "summarize_sales_by_region",
              "summarize_sales_by_customer_segment",
            ],
          },
          {
            id: "buyer_count",
            labels: ["买家数", "付款买家数"],
            resultField: "buyerCount",
            definition: "当前时间窗内已结算订单的去重 customerId 数。",
            eligibility: "status IN (PAID, FULFILLED, REFUNDED)",
            timeField: "EcommerceOrder.paidAt",
            tools: [
              "summarize-ecommerce-sales-by-day",
              "summarize-ecommerce-sales-by-channel",
              "summarize_sales_by_region",
              "summarize_sales_by_customer_segment",
            ],
          },
          {
            id: "gross_merchandise_sales",
            labels: ["商品销售额", "货品GMV"],
            resultField: "grossMerchandiseSales",
            definition: "已结算订单项 lineTotal 之和，不包含运费。",
            eligibility: "status IN (PAID, FULFILLED, REFUNDED)",
            timeField: "EcommerceOrder.paidAt",
            tools: [
              "list-ecommerce-top-products",
              "summarize_merchandise_by_category",
            ],
          },
          {
            id: "net_merchandise_sales",
            labels: ["商品净销售额", "退款后商品销售额"],
            resultField: "netMerchandiseSales",
            definition:
              "将订单 refundedTotal 按 lineTotal / paidTotal 分摊到订单项后的商品销售额，不包含运费。",
            eligibility: "status IN (PAID, FULFILLED, REFUNDED)",
            timeField: "EcommerceOrder.paidAt",
            tools: [
              "list-ecommerce-top-products",
              "summarize_merchandise_by_category",
            ],
          },
          {
            id: "units_sold",
            labels: ["销量", "件数", "销售件数"],
            resultField: "unitsSold",
            definition: "已结算订单项 quantity 之和。",
            eligibility: "status IN (PAID, FULFILLED, REFUNDED)",
            timeField: "EcommerceOrder.paidAt",
            tools: [
              "list-ecommerce-top-products",
              "summarize_merchandise_by_category",
            ],
          },
          {
            id: "fulfillment_backlog",
            labels: ["待履约订单", "履约积压", "未发货订单"],
            resultField: "orderNumber",
            definition:
              "status = PAID 且 fulfilledAt 为空的订单；hoursWaiting 的参考时刻是请求参数 to。",
            timeField: "EcommerceOrder.paidAt",
            tools: ["list-ecommerce-fulfillment-exceptions"],
          },
        ],
        dimensions: [
          {
            id: "payment_day",
            labels: ["付款日", "成交日"],
            field: "(EcommerceOrder.paidAt AT TIME ZONE 'UTC')::date",
            valueSource: {
              kind: "time-bucket",
              description:
                "由请求的 UTC 时间窗动态生成自然日，不维护静态枚举。",
            },
          },
          {
            id: "sales_channel",
            labels: ["渠道", "销售渠道"],
            field: "EcommerceOrder.channel",
            values: [
              {
                value: "WEB",
                labels: ["Web", "网页", "官网"],
              },
              {
                value: "MINI_PROGRAM",
                labels: ["小程序", "微信小程序"],
              },
              {
                value: "MARKETPLACE",
                labels: ["平台", "电商平台", "第三方平台"],
              },
              {
                value: "LIVE_STREAM",
                labels: ["直播", "直播间"],
              },
            ],
          },
          {
            id: "customer_segment",
            labels: ["客户分群", "用户分层", "人群"],
            field: "EcommerceCustomer.segment",
            values: [
              {
                value: "NEW",
                labels: ["新客", "新用户"],
              },
              {
                value: "ACTIVE",
                labels: ["活跃客户", "活跃用户"],
              },
              {
                value: "VIP",
                labels: ["VIP", "高价值客户"],
              },
              {
                value: "AT_RISK",
                labels: ["高流失风险客户", "流失风险客户"],
              },
            ],
          },
          {
            id: "region",
            labels: ["区域", "大区"],
            field: "EcommerceCustomer.region",
            fixtureValues: [
              {
                value: "华东",
                labels: ["华东"],
              },
              {
                value: "华北",
                labels: ["华北"],
              },
              {
                value: "华南",
                labels: ["华南"],
              },
              {
                value: "华中",
                labels: ["华中"],
              },
              {
                value: "西南",
                labels: ["西南"],
              },
              {
                value: "西北",
                labels: ["西北"],
              },
            ],
          },
          {
            id: "product_category",
            labels: ["品类", "商品品类"],
            field: "EcommerceOrderItem.category",
            fixtureValues: [
              {
                value: "智能设备",
                labels: ["智能设备"],
              },
              {
                value: "居家生活",
                labels: ["居家生活"],
              },
              {
                value: "户外运动",
                labels: ["户外运动"],
              },
              {
                value: "美妆个护",
                labels: ["美妆个护"],
              },
              {
                value: "母婴用品",
                labels: ["母婴用品"],
              },
              {
                value: "食品饮料",
                labels: ["食品饮料"],
              },
            ],
          },
          {
            id: "product",
            labels: ["商品", "SKU"],
            field: "EcommerceProduct.sku",
            valueSource: {
              kind: "entity-key",
              description:
                "使用合成商品目录中的 SKU 与 productName，不将动态实体值硬编码进语义目录。",
            },
          },
          {
            id: "order_status",
            labels: ["订单状态", "交易状态"],
            field: "EcommerceOrder.status",
            values: [
              {
                value: "PENDING",
                labels: ["待支付"],
              },
              {
                value: "PAID",
                labels: ["已支付", "待履约"],
              },
              {
                value: "FULFILLED",
                labels: ["已履约", "已发货"],
              },
              {
                value: "CANCELLED",
                labels: ["已取消"],
              },
              {
                value: "REFUNDED",
                labels: ["已退款", "退款订单"],
              },
            ],
          },
        ],
        queryContracts: [
          {
            id: "daily_sales_summary",
            tool: "summarize-ecommerce-sales-by-day",
            metrics: [
              "gross_sales",
              "refund_amount",
              "net_sales",
              "paid_order_count",
              "buyer_count",
            ],
            dimensions: ["payment_day"],
            resultFields: [
              "salesDate",
              "paidOrderCount",
              "buyerCount",
              "grossSales",
              "refundAmount",
              "netSales",
            ],
            limitations: [
              "仅包含已结算订单，时间按 paidAt 的 UTC [from, to) 解释。",
              "净销售额不是会计确认收入或利润。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
          {
            id: "channel_sales_summary",
            tool: "summarize-ecommerce-sales-by-channel",
            metrics: [
              "gross_sales",
              "refund_amount",
              "net_sales",
              "average_order_value",
              "paid_order_count",
              "buyer_count",
            ],
            dimensions: ["sales_channel"],
            resultFields: [
              "channel",
              "paidOrderCount",
              "buyerCount",
              "grossSales",
              "refundAmount",
              "netSales",
              "averageOrderValue",
            ],
            limitations: [
              "只返回渠道聚合，不支持区域、客户分群或商品的任意组合。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
              {
                name: "channel",
                required: false,
                default: "ALL",
              },
            ],
          },
          {
            id: "regional_sales_summary",
            tool: "summarize_sales_by_region",
            metrics: [
              "gross_sales",
              "refund_amount",
              "net_sales",
              "average_order_value",
              "paid_order_count",
              "buyer_count",
            ],
            dimensions: ["region"],
            resultFields: [
              "region",
              "paidOrderCount",
              "buyerCount",
              "grossSales",
              "refundAmount",
              "netSales",
              "averageOrderValue",
            ],
            limitations: ["区域来自合成客户档案，不返回客户明细或联系方式。"],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
              {
                name: "region",
                required: false,
                default: "ALL",
              },
            ],
          },
          {
            id: "customer_segment_sales_summary",
            tool: "summarize_sales_by_customer_segment",
            metrics: [
              "gross_sales",
              "refund_amount",
              "net_sales",
              "average_order_value",
              "paid_order_count",
              "buyer_count",
            ],
            dimensions: ["customer_segment"],
            resultFields: [
              "customerSegment",
              "paidOrderCount",
              "buyerCount",
              "grossSales",
              "refundAmount",
              "netSales",
              "averageOrderValue",
            ],
            limitations: [
              "分群仅支持 NEW、ACTIVE、VIP、AT_RISK 四个认证枚举值。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
              {
                name: "customerSegment",
                required: false,
                default: "ALL",
              },
            ],
          },
          {
            id: "product_sales_ranking",
            tool: "list-ecommerce-top-products",
            metrics: [
              "units_sold",
              "gross_merchandise_sales",
              "net_merchandise_sales",
            ],
            dimensions: ["product", "product_category"],
            resultFields: [
              "sku",
              "productName",
              "category",
              "unitsSold",
              "grossMerchandiseSales",
              "netMerchandiseSales",
              "totalCount",
            ],
            limitations: [
              "商品销售额不包含运费，退款按订单项金额比例分摊。",
              "结果按净商品销售额、销量和 SKU 稳定排序，使用 limit/offset 分页；不能据此推断库存、利润或转化率。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
              {
                name: "limit",
                required: false,
                default: 20,
              },
              {
                name: "offset",
                required: false,
                default: 0,
              },
              {
                name: "category",
                required: false,
                default: "ALL",
              },
            ],
          },
          {
            id: "category_sales_summary",
            tool: "summarize_merchandise_by_category",
            metrics: [
              "units_sold",
              "gross_merchandise_sales",
              "net_merchandise_sales",
            ],
            dimensions: ["product_category"],
            resultFields: [
              "category",
              "unitsSold",
              "grossMerchandiseSales",
              "netMerchandiseSales",
            ],
            limitations: ["商品销售额不包含运费，退款按订单项金额比例分摊。"],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
              {
                name: "category",
                required: false,
                default: "ALL",
              },
            ],
          },
          {
            id: "order_operations_window",
            tool: "list-ecommerce-orders-in-window",
            metrics: [],
            dimensions: [
              "order_status",
              "sales_channel",
              "customer_segment",
              "region",
            ],
            resultFields: [
              "orderNumber",
              "status",
              "channel",
              "customerCode",
              "customerSegment",
              "region",
              "city",
              "placedAt",
              "paidAt",
              "fulfilledAt",
              "paidTotal",
              "refundedTotal",
              "totalCount",
            ],
            limitations: [
              "时间按 placedAt 解释，结果按 placedAt 与订单 id 稳定排序并使用 limit/offset 分页；仅包含合成客户业务属性。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
              {
                name: "limit",
                required: false,
                default: 50,
              },
              {
                name: "offset",
                required: false,
                default: 0,
              },
            ],
          },
          {
            id: "order_detail",
            tool: "get-ecommerce-order-detail",
            metrics: [],
            dimensions: [
              "order_status",
              "sales_channel",
              "customer_segment",
              "region",
              "product_category",
            ],
            resultFields: [
              "orderNumber",
              "status",
              "channel",
              "customerCode",
              "customerSegment",
              "region",
              "city",
              "placedAt",
              "paidAt",
              "fulfilledAt",
              "subtotal",
              "discountTotal",
              "shippingTotal",
              "paidTotal",
              "refundedTotal",
              "items",
            ],
            limitations: ["仅支持明确订单号，不返回真实个人信息。"],
            parameters: [
              {
                name: "orderNumber",
                required: true,
              },
            ],
          },
          {
            id: "fulfillment_exception_list",
            tool: "list-ecommerce-fulfillment-exceptions",
            metrics: ["fulfillment_backlog"],
            dimensions: ["sales_channel", "region"],
            resultFields: [
              "orderNumber",
              "customerCode",
              "region",
              "channel",
              "paidAt",
              "paidTotal",
              "hoursWaiting",
              "totalCount",
            ],
            limitations: [
              "仅包含 status = PAID 且 fulfilledAt 为空的订单。",
              "hoursWaiting 使用请求参数 to 作为参考时刻，不代表当前系统时间。",
              "结果按 paidAt 与订单 id 稳定排序并使用 limit/offset 分页。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
              {
                name: "limit",
                required: false,
                default: 50,
              },
              {
                name: "offset",
                required: false,
                default: 0,
              },
            ],
          },
        ],
        ambiguities: [
          {
            term: "营收",
            action: "clarify",
            reason:
              "当前目录认证的是 grossSales 与 netSales，不等同于会计确认收入。",
          },
          {
            term: "收入",
            action: "clarify",
            reason: "当前目录不提供会计收入或利润口径。",
          },
          {
            term: "订单数",
            action: "clarify",
            reason: "应明确是已结算订单、下单订单、取消订单还是待履约订单。",
          },
        ],
        questionPatterns: [
          {
            id: "sales_trend",
            examples: ["最近7天GMV趋势", "本月退款后销售额"],
            tool: "summarize-ecommerce-sales-by-day",
            contract: "daily_sales_summary",
            required: ["time_window"],
          },
          {
            id: "sales_by_channel",
            examples: ["上周直播渠道GMV", "小程序客单价"],
            tool: "summarize-ecommerce-sales-by-channel",
            contract: "channel_sales_summary",
            required: ["time_window"],
          },
          {
            id: "sales_by_region",
            examples: ["本月华东GMV", "各大区退款额"],
            tool: "summarize_sales_by_region",
            contract: "regional_sales_summary",
            required: ["time_window"],
          },
          {
            id: "sales_by_customer_segment",
            examples: ["VIP客户净销售额", "新客订单数"],
            tool: "summarize_sales_by_customer_segment",
            contract: "customer_segment_sales_summary",
            required: ["time_window"],
          },
          {
            id: "merchandise_by_category",
            examples: ["本月哪个品类卖得最好", "美妆个护退款后商品销售额"],
            tool: "summarize_merchandise_by_category",
            contract: "category_sales_summary",
            required: ["time_window"],
          },
          {
            id: "top_products",
            examples: ["近30天爆款商品", "销量最高的商品"],
            tool: "list-ecommerce-top-products",
            contract: "product_sales_ranking",
            required: ["time_window", "limit"],
          },
          {
            id: "fulfillment_backlog",
            examples: ["当前待履约订单", "过去7天履约积压"],
            tool: "list-ecommerce-fulfillment-exceptions",
            contract: "fulfillment_exception_list",
            required: ["time_window", "limit"],
          },
          {
            id: "orders_in_window",
            examples: ["本周订单状态", "最近订单明细"],
            tool: "list-ecommerce-orders-in-window",
            contract: "order_operations_window",
            required: ["time_window", "limit"],
          },
          {
            id: "order_detail",
            examples: ["查询订单号EC20260601001", "查看指定订单明细"],
            tool: "get-ecommerce-order-detail",
            contract: "order_detail",
            required: ["order_number"],
          },
        ],
      },
      "finance.yaml": {
        kind: "business-semantic-catalog",
        name: "synthetic-finance-operations",
        version: 1,
        databaseSchema: "ecommerce_fixture",
        timeZone: "UTC",
        description:
          "合成经营财务、退款、发票和渠道结算的认证查询目录；不是法定财务报表。",
        metrics: [
          {
            id: "gross_sales",
            labels: ["经营销售额", "原支付额"],
            resultField: "grossSales",
            definition:
              "已结算订单 paidTotal 之和，包含后续退款订单的原支付额。",
            timeField: "EcommerceOrder.paidAt",
            tools: ["summarize_finance_overview"],
          },
          {
            id: "captured_payments",
            labels: ["实收支付额", "支付入账额"],
            resultField: "capturedPayments",
            definition:
              "明确 UTC 时间窗内按 paidAt 统计的 SUCCEEDED 或 REFUNDED 支付记录 amount 之和，不扣除 FinanceRefund。",
            timeField: "EcommercePayment.paidAt",
            tools: ["summarize_finance_overview", "summarize_payment_methods"],
          },
          {
            id: "refund_amount",
            labels: ["已完成退款额", "退款金额"],
            resultField: "refundAmount",
            definition:
              "明确 UTC 时间窗内按 requestedAt 统计、status = COMPLETED 的 FinanceRefund amount 之和。",
            timeField: "FinanceRefund.requestedAt",
            tools: [
              "summarize_finance_overview",
              "summarize_payment_methods",
              "summarize_refunds_by_reason",
            ],
          },
          {
            id: "net_collected",
            labels: ["净实收", "退款后实收"],
            resultField: "netCollected",
            definition:
              "同一 UTC 财务事件时间窗内 capturedPayments - refundAmount；支付按 paidAt、退款按 requestedAt 统计，不是订单 cohort 或会计确认收入。",
            timeField: "EcommercePayment.paidAt",
            tools: ["summarize_finance_overview", "summarize_payment_methods"],
          },
          {
            id: "invoice_mismatch_amount",
            labels: ["发票差异额", "开票差额"],
            resultField: "invoiceMismatchAmount",
            definition:
              "FinanceInvoice mismatchAmount 绝对值；用于汇总和比较差异规模，不保留原始差额方向。",
            timeField: "FinanceInvoice.issuedAt",
            tools: ["summarize_finance_overview", "list_invoice_exceptions"],
          },
          {
            id: "settlement_refund_amount",
            labels: ["结算退款额", "渠道结算退款"],
            resultField: "settlementRefundAmount",
            definition:
              "FinanceSettlement refundAmount 之和，是渠道结算周期口径，不是 FinanceRefund 退款流水。",
            timeField: "FinanceSettlement.periodStart",
            tools: ["reconcile_channel_settlements"],
          },
          {
            id: "settlement_difference",
            labels: ["结算差异额", "对账差额"],
            resultField: "differenceAmount",
            definition:
              "非 PENDING 渠道实际结算额与 expectedAmount 的已记录差异；PENDING 返回 null。",
            timeField: "FinanceSettlement.periodStart",
            tools: ["reconcile_channel_settlements"],
          },
        ],
        dimensions: [
          {
            id: "payment_method",
            labels: ["支付方式", "支付渠道"],
            field: "EcommercePayment.method",
            valueSource: {
              kind: "enum",
              description: "使用合成支付方式枚举。",
            },
          },
          {
            id: "refund_reason",
            labels: ["退款原因", "退因"],
            field: "FinanceRefund.reason",
            valueSource: {
              kind: "enum",
              description: "使用合成退款原因枚举。",
            },
          },
          {
            id: "invoice_status",
            labels: ["发票状态", "开票状态"],
            field: "FinanceInvoice.status",
            valueSource: {
              kind: "enum",
              description: "使用合成发票状态枚举。",
            },
          },
          {
            id: "sales_channel",
            labels: ["结算渠道", "销售渠道"],
            field: "FinanceSettlement.channel",
            valueSource: {
              kind: "enum",
              description: "使用合成销售渠道枚举。",
            },
          },
        ],
        queryContracts: [
          {
            id: "finance_overview",
            tool: "summarize_finance_overview",
            metrics: [
              "gross_sales",
              "captured_payments",
              "refund_amount",
              "net_collected",
              "invoice_mismatch_amount",
            ],
            dimensions: [],
            resultFields: [
              "settledOrderCount",
              "grossSales",
              "capturedPayments",
              "completedRefundCount",
              "refundAmount",
              "netCollected",
              "invoiceAmount",
              "invoiceMismatchAmount",
            ],
            limitations: [
              "经营口径不是法定财务报表，且不同事实使用各自业务时间字段。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
          {
            id: "payment_method_summary",
            tool: "summarize_payment_methods",
            metrics: ["captured_payments", "refund_amount", "net_collected"],
            dimensions: ["payment_method"],
            resultFields: [
              "paymentMethod",
              "paymentCount",
              "succeededCount",
              "capturedPayments",
              "completedRefundCount",
              "refundAmount",
              "netCollected",
            ],
            limitations: [
              "支付按 paidAt、退款按 requestedAt 落入同一 UTC 事件时间窗；退款通过 orderId 归属支付方式，不是支付订单 cohort 或支付机构清算数据。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
          {
            id: "refund_reason_summary",
            tool: "summarize_refunds_by_reason",
            metrics: ["refund_amount"],
            dimensions: ["refund_reason"],
            resultFields: [
              "reason",
              "refundRequestCount",
              "completedRefundCount",
              "refundAmount",
              "averageProcessingHours",
            ],
            limitations: [
              "退款额只统计 COMPLETED，平均时长来自合成 processingHours。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
          {
            id: "invoice_exception_list",
            tool: "list_invoice_exceptions",
            metrics: ["invoice_mismatch_amount"],
            dimensions: ["invoice_status"],
            resultFields: [
              "invoiceNumber",
              "orderNumber",
              "status",
              "amount",
              "mismatchAmount",
              "invoiceMismatchAmount",
              "issuedAt",
              "dueAt",
              "totalCount",
            ],
            limitations: [
              "仅返回异常或截至 to 已逾期的发票，并使用 limit/offset 分页。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
              {
                name: "limit",
                required: false,
                default: 50,
              },
              {
                name: "offset",
                required: false,
                default: 0,
              },
            ],
          },
          {
            id: "channel_settlement_reconciliation",
            tool: "reconcile_channel_settlements",
            metrics: ["settlement_refund_amount", "settlement_difference"],
            dimensions: ["sales_channel"],
            resultFields: [
              "channel",
              "status",
              "settlementCount",
              "grossAmount",
              "settlementRefundAmount",
              "feeAmount",
              "expectedAmount",
              "settledAmount",
              "differenceAmount",
            ],
            limitations: [
              "时间窗按 periodStart 解释；settlementRefundAmount 是 FinanceSettlement 结算口径，不等于 FinanceRefund 退款流水。",
              "differenceAmount 是渠道结算差异，不等于发票差异。",
              "PENDING 状态尚无实际结算，settledAmount 和 differenceAmount 均为 null，不能解释为已足额结算。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
        ],
        ambiguities: [
          {
            term: "收入",
            action: "clarify",
            reason: "应明确是经营销售额、净实收、发票金额还是会计确认收入。",
          },
        ],
        questionPatterns: [
          {
            id: "finance_overview",
            examples: ["本月经营财务概览"],
            tool: "summarize_finance_overview",
            contract: "finance_overview",
            required: ["time_window"],
          },
          {
            id: "payment_methods",
            examples: ["各支付方式实收和退款"],
            tool: "summarize_payment_methods",
            contract: "payment_method_summary",
            required: ["time_window"],
          },
          {
            id: "refund_reasons",
            examples: ["退款主要是什么原因"],
            tool: "summarize_refunds_by_reason",
            contract: "refund_reason_summary",
            required: ["time_window"],
          },
          {
            id: "invoice_exceptions",
            examples: ["列出异常发票"],
            tool: "list_invoice_exceptions",
            contract: "invoice_exception_list",
            required: ["time_window", "limit", "offset"],
          },
          {
            id: "settlement_reconciliation",
            examples: ["各渠道结算差异"],
            tool: "reconcile_channel_settlements",
            contract: "channel_settlement_reconciliation",
            required: ["time_window"],
          },
        ],
      },
      "logistics.yaml": {
        kind: "business-semantic-catalog",
        name: "synthetic-logistics-operations",
        version: 1,
        databaseSchema: "ecommerce_fixture",
        timeZone: "UTC",
        description:
          "合成运单、承运商、配送 SLA、物流轨迹和运费的认证查询目录。",
        metrics: [
          {
            id: "shipment_count",
            labels: ["运单量", "发货单量"],
            resultField: "shipmentCount",
            definition: "明确发货时间窗内的 LogisticsShipment 数量。",
            timeField: "LogisticsShipment.shippedAt",
            tools: [
              "summarize_carrier_performance",
              "summarize_delivery_sla",
              "summarize_freight_costs",
            ],
          },
          {
            id: "on_time_delivery_rate",
            labels: ["准时签收率", "配送准时率"],
            resultField: "onTimeDeliveryRate",
            definition:
              "deliveredAt <= promisedAt 的已签收运单占已签收运单比例。",
            timeField: "LogisticsShipment.shippedAt",
            tools: ["summarize_carrier_performance", "summarize_delivery_sla"],
          },
          {
            id: "logistics_exception_count",
            labels: ["物流异常量", "异常运单数"],
            resultField: "exceptionCount",
            definition: "状态异常、迟签或超过承诺时间未签收的运单数量。",
            timeField: "LogisticsShipment.shippedAt",
            tools: ["summarize_carrier_performance"],
          },
          {
            id: "logistics_exception_total",
            labels: ["物流异常列表总数", "异常运单总数"],
            resultField: "totalCount",
            definition:
              "当前异常列表条件匹配的运单总数，用于分页，不是承运商聚合字段。",
            timeField: "LogisticsShipment.shippedAt",
            tools: ["list_logistics_exceptions"],
          },
          {
            id: "average_delivery_hours",
            labels: ["平均配送小时", "配送时长"],
            resultField: "averageDeliveryHours",
            definition: "已签收运单 deliveredAt - shippedAt 的平均小时数。",
            timeField: "LogisticsShipment.shippedAt",
            tools: ["summarize_carrier_performance"],
          },
          {
            id: "freight_cost",
            labels: ["物流运费", "配送成本"],
            resultField: "totalFreightCost",
            definition:
              "LogisticsShipment freightCost 之和，不包含仓储、包装和逆向物流。",
            timeField: "LogisticsShipment.shippedAt",
            tools: ["summarize_freight_costs"],
          },
        ],
        dimensions: [
          {
            id: "carrier",
            labels: ["承运商", "快递公司"],
            field: "LogisticsShipment.carrier",
            valueSource: {
              kind: "enum",
              description: "使用合成承运商枚举。",
            },
          },
          {
            id: "promised_day",
            labels: ["承诺签收日", "SLA 日期"],
            field: "(LogisticsShipment.promisedAt AT TIME ZONE 'UTC')::date",
            valueSource: {
              kind: "time-bucket",
              description: "按 UTC 承诺日期动态生成。",
            },
          },
          {
            id: "shipment_status",
            labels: ["运单状态", "物流状态"],
            field: "LogisticsShipment.status",
            valueSource: {
              kind: "enum",
              description: "使用合成运单状态枚举。",
            },
          },
          {
            id: "shipment",
            labels: ["运单", "包裹"],
            field: "LogisticsShipment.shipmentNumber",
            valueSource: {
              kind: "entity-key",
              description: "使用明确的合成运单号。",
            },
          },
        ],
        queryContracts: [
          {
            id: "carrier_performance",
            tool: "summarize_carrier_performance",
            metrics: [
              "shipment_count",
              "on_time_delivery_rate",
              "logistics_exception_count",
              "average_delivery_hours",
            ],
            dimensions: ["carrier"],
            resultFields: [
              "carrier",
              "shipmentCount",
              "deliveredCount",
              "onTimeCount",
              "exceptionCount",
              "onTimeDeliveryRate",
              "averageDeliveryHours",
            ],
            limitations: [
              "准时率仅以已签收运单为分母，不能把未签收视作准时或迟到。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
          {
            id: "logistics_exception_list",
            tool: "list_logistics_exceptions",
            metrics: ["logistics_exception_total"],
            dimensions: ["carrier", "shipment_status", "shipment"],
            resultFields: [
              "shipmentNumber",
              "orderNumber",
              "warehouseCode",
              "carrier",
              "status",
              "shippedAt",
              "promisedAt",
              "deliveredAt",
              "hoursPastPromise",
              "totalCount",
            ],
            limitations: [
              "未签收运单以请求参数 to 作为异常参考时刻，并使用 limit/offset 分页。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
              {
                name: "limit",
                required: false,
                default: 50,
              },
              {
                name: "offset",
                required: false,
                default: 0,
              },
            ],
          },
          {
            id: "shipment_trace",
            tool: "get_shipment_trace",
            metrics: [],
            dimensions: ["shipment", "shipment_status", "carrier"],
            resultFields: [
              "shipmentNumber",
              "orderNumber",
              "carrier",
              "status",
              "shippedAt",
              "promisedAt",
              "deliveredAt",
              "eventType",
              "eventAt",
              "location",
              "detail",
            ],
            limitations: [
              "只接受明确运单号并最多返回 100 条按时间排序的合成轨迹事件。",
            ],
            parameters: [
              {
                name: "shipmentNumber",
                required: true,
              },
              {
                name: "limit",
                required: false,
                default: 100,
              },
            ],
          },
          {
            id: "delivery_sla_summary",
            tool: "summarize_delivery_sla",
            metrics: ["shipment_count", "on_time_delivery_rate"],
            dimensions: ["promised_day"],
            resultFields: [
              "promisedDate",
              "shipmentCount",
              "onTimeCount",
              "lateCount",
              "undeliveredPastPromiseCount",
              "onTimeDeliveryRate",
            ],
            limitations: ["未签收积压单独返回，不进入已签收准时率分母。"],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
          {
            id: "freight_cost_summary",
            tool: "summarize_freight_costs",
            metrics: ["shipment_count", "freight_cost"],
            dimensions: ["carrier"],
            resultFields: [
              "carrier",
              "shipmentCount",
              "totalFreightCost",
              "averageFreightCost",
              "totalDistanceKm",
              "freightCostPerKm",
            ],
            limitations: [
              "运费不包含仓储、包装和逆向物流，不能单独推断订单利润。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
        ],
        ambiguities: [
          {
            term: "时效",
            action: "clarify",
            reason: "应明确关注平均配送时长、准时签收率还是超时异常。",
          },
        ],
        questionPatterns: [
          {
            id: "carrier_performance",
            examples: ["各承运商准时率和异常量"],
            tool: "summarize_carrier_performance",
            contract: "carrier_performance",
            required: ["time_window"],
          },
          {
            id: "logistics_exceptions",
            examples: ["列出延迟和异常运单"],
            tool: "list_logistics_exceptions",
            contract: "logistics_exception_list",
            required: ["time_window", "limit", "offset"],
          },
          {
            id: "shipment_trace",
            examples: ["查询运单轨迹"],
            tool: "get_shipment_trace",
            contract: "shipment_trace",
            required: ["shipment_number"],
          },
          {
            id: "delivery_sla",
            examples: ["按承诺日看配送 SLA"],
            tool: "summarize_delivery_sla",
            contract: "delivery_sla_summary",
            required: ["time_window"],
          },
          {
            id: "freight_costs",
            examples: ["各承运商物流成本"],
            tool: "summarize_freight_costs",
            contract: "freight_cost_summary",
            required: ["time_window"],
          },
        ],
      },
      "marketing.yaml": {
        kind: "business-semantic-catalog",
        name: "synthetic-marketing-analysis",
        version: 1,
        databaseSchema: "ecommerce_fixture",
        timeZone: "UTC",
        description:
          "合成营销活动、触点归因、渠道、优惠券和获客的认证查询目录。",
        metrics: [
          {
            id: "attributed_revenue",
            labels: ["归因收入", "营销归因销售额"],
            resultField: "attributedRevenue",
            definition:
              "MarketingAttribution attributedRevenue 之和，是规则归因而非增量收入。",
            timeField: "MarketingAttribution.touchpointAt",
            tools: [
              "summarize_campaign_performance",
              "summarize_marketing_by_channel",
              "summarize_coupon_performance",
              "list_underperforming_campaigns",
              "summarize_customer_acquisition",
            ],
          },
          {
            id: "allocated_spend",
            labels: ["归因分摊费用", "营销分摊成本"],
            resultField: "allocatedSpend",
            definition:
              "MarketingAttribution allocatedSpend 之和，不一定等于活动完整 spend。",
            timeField: "MarketingAttribution.touchpointAt",
            tools: [
              "summarize_campaign_performance",
              "summarize_marketing_by_channel",
              "summarize_coupon_performance",
              "list_underperforming_campaigns",
              "summarize_customer_acquisition",
            ],
          },
          {
            id: "return_on_ad_spend",
            labels: ["ROAS", "广告投入产出"],
            resultField: "roas",
            definition:
              "attributedRevenue / allocatedSpend；不证明因果增量效果。",
            timeField: "MarketingAttribution.touchpointAt",
            tools: [
              "summarize_campaign_performance",
              "summarize_marketing_by_channel",
              "list_underperforming_campaigns",
            ],
          },
          {
            id: "attributed_order_count",
            labels: ["归因订单数", "营销订单量"],
            resultField: "attributedOrderCount",
            definition:
              "当前维度内去重 MarketingAttribution orderId 数；跨渠道可能重复。",
            timeField: "MarketingAttribution.touchpointAt",
            tools: [
              "summarize_campaign_performance",
              "summarize_marketing_by_channel",
              "summarize_coupon_performance",
            ],
          },
          {
            id: "new_customer_count",
            labels: ["归因新客数", "新客户量"],
            resultField: "newCustomerCount",
            definition:
              "isNewCustomer = true 的去重归因订单数，用作合成获客代理指标。",
            timeField: "MarketingAttribution.touchpointAt",
            tools: [
              "summarize_campaign_performance",
              "summarize_marketing_by_channel",
              "summarize_coupon_performance",
              "summarize_customer_acquisition",
            ],
          },
          {
            id: "customer_acquisition_cost",
            labels: ["获客成本", "CAC"],
            resultField: "customerAcquisitionCost",
            definition: "新客触点 allocatedSpend / 去重新客订单数。",
            timeField: "MarketingAttribution.touchpointAt",
            tools: ["summarize_customer_acquisition"],
          },
        ],
        dimensions: [
          {
            id: "campaign",
            labels: ["营销活动", "投放活动"],
            field: "MarketingCampaign.campaignCode",
            valueSource: {
              kind: "entity-key",
              description: "使用合成活动编码。",
            },
          },
          {
            id: "marketing_channel",
            labels: ["营销渠道", "归因渠道"],
            field: "MarketingAttribution.channel",
            valueSource: {
              kind: "enum",
              description: "使用合成营销渠道枚举。",
            },
          },
          {
            id: "coupon",
            labels: ["优惠券", "券码"],
            field: "MarketingAttribution.couponCode",
            valueSource: {
              kind: "entity-key",
              description: "使用合成优惠券编码，空值表示未用券。",
            },
          },
        ],
        queryContracts: [
          {
            id: "campaign_performance",
            tool: "summarize_campaign_performance",
            metrics: [
              "attributed_revenue",
              "allocated_spend",
              "return_on_ad_spend",
              "attributed_order_count",
              "new_customer_count",
            ],
            dimensions: ["campaign", "marketing_channel"],
            resultFields: [
              "campaignCode",
              "campaignName",
              "channel",
              "objective",
              "startAt",
              "endAt",
              "budget",
              "spend",
              "attributedOrderCount",
              "attributedRevenue",
              "allocatedSpend",
              "newCustomerCount",
              "roas",
            ],
            limitations: [
              "归因收入不是增量收入，活动 budget/spend 是完整活动档案值。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
          {
            id: "marketing_channel_summary",
            tool: "summarize_marketing_by_channel",
            metrics: [
              "attributed_revenue",
              "allocated_spend",
              "return_on_ad_spend",
              "attributed_order_count",
              "new_customer_count",
            ],
            dimensions: ["marketing_channel"],
            resultFields: [
              "channel",
              "touchpointCount",
              "attributedOrderCount",
              "attributedRevenue",
              "allocatedSpend",
              "newCustomerCount",
              "roas",
            ],
            limitations: [
              "同一订单可有多个渠道触点，跨渠道订单数不能直接相加去重。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
          {
            id: "coupon_performance",
            tool: "summarize_coupon_performance",
            metrics: [
              "attributed_revenue",
              "allocated_spend",
              "attributed_order_count",
              "new_customer_count",
            ],
            dimensions: ["coupon"],
            resultFields: [
              "couponCode",
              "attributedOrderCount",
              "attributedRevenue",
              "allocatedSpend",
              "newCustomerCount",
              "averageAttributedRevenue",
            ],
            limitations: [
              "当前没有优惠面值和完整促销成本，不能将 allocatedSpend 当作优惠成本。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
          {
            id: "underperforming_campaign_list",
            tool: "list_underperforming_campaigns",
            metrics: [
              "attributed_revenue",
              "allocated_spend",
              "return_on_ad_spend",
            ],
            dimensions: ["campaign", "marketing_channel"],
            resultFields: [
              "campaignCode",
              "campaignName",
              "channel",
              "objective",
              "startAt",
              "endAt",
              "budget",
              "spend",
              "attributedOrderCount",
              "attributedRevenue",
              "allocatedSpend",
              "roas",
              "totalCount",
            ],
            limitations: [
              "低效规则只比较同一窗口内 attributedRevenue 与 allocatedSpend；活动 spend/budget 仅作档案展示，并使用 limit/offset 分页。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
              {
                name: "limit",
                required: false,
                default: 50,
              },
              {
                name: "offset",
                required: false,
                default: 0,
              },
            ],
          },
          {
            id: "customer_acquisition_summary",
            tool: "summarize_customer_acquisition",
            metrics: [
              "attributed_revenue",
              "allocated_spend",
              "new_customer_count",
              "customer_acquisition_cost",
            ],
            dimensions: ["marketing_channel"],
            resultFields: [
              "channel",
              "newCustomerCount",
              "attributedRevenue",
              "allocatedSpend",
              "customerAcquisitionCost",
              "revenuePerNewCustomer",
            ],
            limitations: [
              "新客使用 isNewCustomer 合成标记，不代表真实用户身份去重或增量获客。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
        ],
        ambiguities: [
          {
            term: "转化率",
            action: "clarify",
            reason:
              "当前目录没有曝光、点击和访问基数，只提供归因订单、收入、费用和获客代理指标。",
          },
        ],
        questionPatterns: [
          {
            id: "campaign_performance",
            examples: ["各营销活动的 ROAS"],
            tool: "summarize_campaign_performance",
            contract: "campaign_performance",
            required: ["time_window"],
          },
          {
            id: "marketing_channels",
            examples: ["各营销渠道的归因收入"],
            tool: "summarize_marketing_by_channel",
            contract: "marketing_channel_summary",
            required: ["time_window"],
          },
          {
            id: "coupon_performance",
            examples: ["各优惠券带来的归因订单"],
            tool: "summarize_coupon_performance",
            contract: "coupon_performance",
            required: ["time_window"],
          },
          {
            id: "underperforming_campaigns",
            examples: ["列出低 ROAS 活动"],
            tool: "list_underperforming_campaigns",
            contract: "underperforming_campaign_list",
            required: ["time_window", "limit", "offset"],
          },
          {
            id: "customer_acquisition",
            examples: ["各渠道新客和获客成本"],
            tool: "summarize_customer_acquisition",
            contract: "customer_acquisition_summary",
            required: ["time_window"],
          },
        ],
      },
      "supply-chain.yaml": {
        kind: "business-semantic-catalog",
        name: "synthetic-supply-chain-operations",
        version: 1,
        databaseSchema: "ecommerce_fixture",
        timeZone: "UTC",
        description:
          "合成库存快照、仓库、供应商和采购订单的认证供应链查询目录。",
        metrics: [
          {
            id: "available_units",
            labels: ["可用库存", "可售库存"],
            resultField: "availableUnits",
            definition: "InventorySnapshot onHand - reserved。",
            timeField: "InventorySnapshot.snapshotDate",
            tools: [
              "summarize_inventory_health",
              "list_stockout_risks",
              "summarize_inventory_by_warehouse",
            ],
          },
          {
            id: "inventory_value",
            labels: ["库存金额", "库存价值"],
            resultField: "inventoryValue",
            definition: "每个库存快照的 onHand * unitCost 之和。",
            timeField: "InventorySnapshot.snapshotDate",
            tools: [
              "summarize_inventory_health",
              "summarize_inventory_by_warehouse",
            ],
          },
          {
            id: "stock_gap_units",
            labels: ["安全库存缺口", "缺货缺口"],
            resultField: "stockGapUnits",
            definition: "safetyStock - availableUnits；正数表示低于安全库存。",
            timeField: "InventorySnapshot.snapshotDate",
            tools: ["list_stockout_risks"],
          },
          {
            id: "procurement_amount",
            labels: ["采购金额", "采购支出"],
            resultField: "procurementAmount",
            definition:
              "非 CANCELLED ProcurementOrder amount 之和，不代表已付款现金或会计成本。",
            timeField: "ProcurementOrder.orderedAt",
            tools: [
              "summarize_procurement_spend",
              "summarize_supplier_performance",
            ],
          },
          {
            id: "supplier_on_time_rate",
            labels: ["供应商准时率", "采购准时率"],
            resultField: "actualOnTimeRate",
            definition:
              "非 CANCELLED 且 receivedAt <= expectedAt 的已收货采购单占非取消已收货采购单比例。",
            timeField: "ProcurementOrder.orderedAt",
            tools: ["summarize_supplier_performance"],
          },
          {
            id: "delayed_purchase_orders",
            labels: ["延期采购单", "采购异常量"],
            resultField: "delayedOrderCount",
            definition:
              "非 CANCELLED 且 delayedDays > 0、迟收货或截至 to 仍未按预计日期收货的采购单。",
            timeField: "ProcurementOrder.orderedAt",
            tools: [
              "summarize_procurement_spend",
              "summarize_supplier_performance",
            ],
          },
          {
            id: "purchase_order_exception_total",
            labels: ["采购异常列表总数", "延期采购单总数"],
            resultField: "totalCount",
            definition:
              "当前采购异常列表条件匹配的非 CANCELLED 采购单总数，用于分页。",
            timeField: "ProcurementOrder.orderedAt",
            tools: ["list_purchase_order_exceptions"],
          },
        ],
        dimensions: [
          {
            id: "inventory_risk_level",
            labels: ["库存风险等级", "缺货风险"],
            field: "InventorySnapshot.riskLevel",
            valueSource: {
              kind: "enum",
              description: "使用合成库存风险枚举。",
            },
          },
          {
            id: "warehouse",
            labels: ["仓库", "履约仓"],
            field: "InventoryWarehouse.warehouseCode",
            valueSource: {
              kind: "entity-key",
              description: "使用合成仓库编码。",
            },
          },
          {
            id: "supplier",
            labels: ["供应商", "供货商"],
            field: "ProcurementSupplier.supplierCode",
            valueSource: {
              kind: "entity-key",
              description: "使用合成供应商编码。",
            },
          },
          {
            id: "supplier_category",
            labels: ["供应商品类", "采购品类"],
            field: "ProcurementSupplier.category",
            valueSource: {
              kind: "entity-value",
              description: "使用供应商档案中的合成品类。",
            },
          },
        ],
        queryContracts: [
          {
            id: "inventory_health",
            tool: "summarize_inventory_health",
            metrics: ["available_units", "inventory_value"],
            dimensions: ["inventory_risk_level"],
            resultFields: [
              "riskLevel",
              "snapshotCount",
              "skuCount",
              "onHandUnits",
              "reservedUnits",
              "availableUnits",
              "inTransitUnits",
              "safetyStockUnits",
              "inventoryValue",
            ],
            limitations: [
              "多日快照会分别计入，不能把时间窗汇总误认为单日库存余额。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
          {
            id: "stockout_risk_list",
            tool: "list_stockout_risks",
            metrics: ["available_units", "stock_gap_units"],
            dimensions: ["inventory_risk_level", "warehouse"],
            resultFields: [
              "snapshotDate",
              "warehouseCode",
              "warehouseName",
              "sku",
              "productName",
              "riskLevel",
              "onHand",
              "reserved",
              "availableUnits",
              "inTransit",
              "safetyStock",
              "stockGapUnits",
              "totalCount",
            ],
            limitations: [
              "仅返回风险快照并使用 limit/offset 分页；不表示实时可售库存。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
              {
                name: "limit",
                required: false,
                default: 50,
              },
              {
                name: "offset",
                required: false,
                default: 0,
              },
            ],
          },
          {
            id: "warehouse_inventory_summary",
            tool: "summarize_inventory_by_warehouse",
            metrics: ["available_units", "inventory_value"],
            dimensions: ["warehouse"],
            resultFields: [
              "warehouseCode",
              "warehouseName",
              "region",
              "city",
              "skuCount",
              "onHandUnits",
              "availableUnits",
              "inTransitUnits",
              "riskSnapshotCount",
              "inventoryValue",
              "averageDailyCapacityUtilization",
            ],
            limitations: [
              "averageDailyCapacityUtilization 按快照自然日平均整仓在库量计算，不是实时仓容。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
          {
            id: "procurement_spend_summary",
            tool: "summarize_procurement_spend",
            metrics: ["procurement_amount", "delayed_purchase_orders"],
            dimensions: ["supplier_category"],
            resultFields: [
              "category",
              "purchaseOrderCount",
              "skuCount",
              "procurementAmount",
              "delayedOrderCount",
              "averageDelayedDays",
            ],
            limitations: [
              "已取消采购单不进入汇总；采购金额是订单金额，不是付款或会计成本确认。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
          {
            id: "supplier_performance_summary",
            tool: "summarize_supplier_performance",
            metrics: [
              "procurement_amount",
              "supplier_on_time_rate",
              "delayed_purchase_orders",
            ],
            dimensions: ["supplier", "supplier_category"],
            resultFields: [
              "supplierCode",
              "supplierName",
              "category",
              "region",
              "rating",
              "leadTimeDays",
              "profileOnTimeRate",
              "purchaseOrderCount",
              "procurementAmount",
              "delayedOrderCount",
              "actualOnTimeRate",
            ],
            limitations: [
              "已取消采购单不进入汇总；实际准时率仅以已收货采购单为分母，区别于供应商档案目标准时率。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
            ],
          },
          {
            id: "purchase_order_exception_list",
            tool: "list_purchase_order_exceptions",
            metrics: ["purchase_order_exception_total"],
            dimensions: ["supplier", "warehouse"],
            resultFields: [
              "purchaseOrderNumber",
              "supplierCode",
              "supplierName",
              "warehouseCode",
              "status",
              "orderedAt",
              "expectedAt",
              "receivedAt",
              "amount",
              "skuCount",
              "delayedDays",
              "currentDelayedDays",
              "totalCount",
            ],
            limitations: [
              "已取消采购单不属于异常；其他未收货采购单使用请求参数 to 计算当前延期天数，并使用 limit/offset 分页。",
            ],
            parameters: [
              {
                name: "from",
                required: true,
              },
              {
                name: "to",
                required: true,
              },
              {
                name: "limit",
                required: false,
                default: 50,
              },
              {
                name: "offset",
                required: false,
                default: 0,
              },
            ],
          },
        ],
        ambiguities: [
          {
            term: "库存",
            action: "clarify",
            reason: "应明确在库、占用、可用、在途、安全库存或库存金额。",
          },
        ],
        questionPatterns: [
          {
            id: "inventory_health",
            examples: ["库存健康情况和风险分布"],
            tool: "summarize_inventory_health",
            contract: "inventory_health",
            required: ["time_window"],
          },
          {
            id: "stockout_risks",
            examples: ["列出缺货风险 SKU"],
            tool: "list_stockout_risks",
            contract: "stockout_risk_list",
            required: ["time_window", "limit", "offset"],
          },
          {
            id: "warehouse_inventory",
            examples: ["各仓库库存和仓容"],
            tool: "summarize_inventory_by_warehouse",
            contract: "warehouse_inventory_summary",
            required: ["time_window"],
          },
          {
            id: "procurement_spend",
            examples: ["各采购品类的采购金额"],
            tool: "summarize_procurement_spend",
            contract: "procurement_spend_summary",
            required: ["time_window"],
          },
          {
            id: "supplier_performance",
            examples: ["供应商准时率和采购额"],
            tool: "summarize_supplier_performance",
            contract: "supplier_performance_summary",
            required: ["time_window"],
          },
          {
            id: "purchase_order_exceptions",
            examples: ["列出延期采购单"],
            tool: "list_purchase_order_exceptions",
            contract: "purchase_order_exception_list",
            required: ["time_window", "limit", "offset"],
          },
        ],
      },
    }).map(([file, catalog]) => [
      file,
      BusinessSemanticCatalogSchema.parse(catalog),
    ]),
  ),
) as Readonly<Record<string, BusinessSemanticCatalog>>;
