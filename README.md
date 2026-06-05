# World Cup Prediction Market Console

2026 世界杯预测市场分析站。项目聚合 Polymarket 世界杯相关盘口，结合本地 Elo/教练/近期状态/球员池模型和可配置 AI Provider，生成比赛预测、市场差值和每日赛前推送。

> Fork 说明：本仓库基于上游项目二次开发，已移除原作者个人线上地址、社群和品牌化入口。保留并扩展原项目的世界杯赛程、球队、球员、Polymarket 数据接入和 AI 分析思路；数据源与第三方 API 见文末引用说明。

## 当前能力

| 模块 | 说明 |
| --- | --- |
| 市场扫描 | 聚合 Polymarket 世界杯冠军、金靴等事件，展示隐含概率、成交量、流动性、conditionId 和 CLOB token |
| 比赛预测 | 104 场赛程，按 Elo、教练胜率、近期状态和球员评分生成胜平负、公平赔率和比分预测 |
| 单场盘口 | 比赛页优先匹配 Polymarket 真实主胜/平局/客胜市场；找不到时退回冠军盘热度代理 |
| CLOB 数据 | 提供 token 级 orderbook、spread、midpoint、price history API |
| AI 分析 | 后台可配置 MiniMax 国内版、小米 MiMo、OpenAI-compatible 网关 |
| 用户系统 | 支持注册/登录；第一个注册用户自动成为管理员 |
| 个人推送 | 每个用户可配置独立 Telegram Bot、Telegram Chat ID、方糖 Server 酱 SendKey |
| 每日简报 | VPS cron 调用 `/api/cron/daily-brief`，按用户时区在比赛日前一天推送次日预测 |
| 管理后台 | `/dashboard`、`/settings`、`/admin/ai` |

## 技术栈

- Next.js 15 App Router + React 19 + TypeScript
- Tailwind CSS
- SQLite + `better-sqlite3`
- Cookie session + `scrypt` 密码哈希
- Polymarket Gamma API + CLOB public market data
- Telegram Bot API、方糖 Server 酱 Turbo

## 本地开发

```bash
corepack enable
corepack prepare pnpm@10.24.0 --activate
pnpm install
cp .env.example .env.local
pnpm dev
```

首次打开：

1. 访问 `http://localhost:3000/register`
2. 注册第一个账号，它会自动成为管理员
3. 访问 `/admin/ai` 配置 AI Provider
4. 访问 `/settings` 配置个人 Telegram / 方糖推送

## 环境变量

见 `.env.example`。生产环境至少设置：

```env
APP_SECRET=change_this_to_a_long_random_string
DATA_DIR=/var/lib/worldcup-predict
CRON_SECRET=change_this_cron_secret
```

`APP_SECRET` 用于加密数据库中的 API Key、Telegram Token 和 Server 酱 SendKey。生产环境部署后不要频繁更换，否则旧密文无法解密。

## AI Provider

后台路径：`/admin/ai`

内置三类 Provider：

- `MiniMax 国内版`：调用 `/v1/text/chatcompletion_v2`，默认 `https://api.minimax.chat`
- `小米 MiMo`：按 OpenAI-compatible 协议调用 `/chat/completions`，默认模型 `mimo-v2.5-pro`
- `OpenAI 兼容接口`：用于接入通义、Moonshot、DeepSeek、自建 New API 等兼容网关

启用且设为默认的 Provider 会被 `lib/ai.ts` 使用。若后台没有可用配置，会回退到 `MINIMAX_API_KEY` 等环境变量。

## 推送配置

用户路径：`/settings`

Telegram：

- 从 BotFather 获取 Bot Token
- 用户或群给 Bot 发一条消息后，用 Telegram `getUpdates` 查询 Chat ID

方糖 / Server 酱：

- 在 Server 酱获取 SendKey
- 系统向 `https://sctapi.ftqq.com/{SENDKEY}.send` 发送 `title` 和 `desp`

## 每日赛前推送

接口：

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://127.0.0.1:3000/api/cron/daily-brief
```

建议 VPS 上每小时执行一次。系统会按每个用户配置的 `push_timezone` 和 `push_hour` 判断是否需要发送。如果明天没有比赛，默认不推送；可设置 `PUSH_EMPTY_DAYS=1` 改为也推送空日提醒。

每日简报会优先使用 Polymarket 单场盘口（主胜/平局/客胜），并输出模型概率、市场价格、edge、spread；暂未匹配到单场盘口时才退回世界杯冠军盘作为市场代理。

示例 crontab：

```cron
0 * * * * curl -fsS -H "Authorization: Bearer your_cron_secret" http://127.0.0.1:3000/api/cron/daily-brief >/dev/null
```

## VPS 部署

推荐 Ubuntu 22.04/24.04，Node.js 22 或 24，使用 systemd 常驻。

```bash
git clone https://github.com/w00c00/worldcup-polymarket-win.git
cd worldcup-polymarket-win
corepack enable
corepack prepare pnpm@10.24.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.production
mkdir -p /var/lib/worldcup-predict
pnpm build
pnpm start
```

systemd 示例：

```ini
[Unit]
Description=World Cup Prediction Market
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/worldcup-polymarket-win
EnvironmentFile=/opt/worldcup-polymarket-win/.env.production
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

如需 Nginx 反代：

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 项目结构

```text
app/
  api/cron/daily-brief/route.ts  # VPS cron 推送入口
  api/matches/[id]/markets/route.ts
                                  # 按比赛 ID 返回真实 Polymarket 单场盘口
  api/polymarket/orderbook/route.ts
                                  # CLOB token orderbook/spread/midpoint
  api/polymarket/price-history/route.ts
                                  # CLOB token 价格历史
  admin/ai/page.tsx              # AI Provider 后台
  dashboard/page.tsx             # 用户控制台
  settings/page.tsx              # 个人推送配置
lib/
  ai-providers.ts                # MiniMax / MiMo / OpenAI-compatible 适配层
  auth.ts                        # 注册、登录、Cookie session
  daily-brief.ts                 # 次日比赛简报生成与推送
  db.ts                          # SQLite schema 与数据访问
  notifications.ts               # Telegram / Server 酱发送
  polymarket.ts                  # Polymarket Gamma + CLOB 数据接口
```

## 市场数据接口

按比赛读取真实 Polymarket 单场市场：

```bash
curl http://127.0.0.1:3000/api/matches/m1/markets
```

读取某个 YES token 的订单簿：

```bash
curl "http://127.0.0.1:3000/api/polymarket/orderbook?tokenId=TOKEN_ID"
```

读取某个 YES token 的价格历史：

```bash
curl "http://127.0.0.1:3000/api/polymarket/price-history?tokenId=TOKEN_ID&days=7&interval=1h"
```

## 后续建议

- 增加用户级 watchlist 和价格/edge 阈值提醒
- 增加模型回测：记录每次 YES/NO/WATCH 信号和后续价格变化
- 为真实单场盘口增加缓存/快照表，用于后续回测和价格提醒

## 引用与第三方来源

- Polymarket API 文档：<https://docs.polymarket.com/api-reference/introduction>
- Polymarket Market Data：<https://docs.polymarket.com/market-data/overview>
- Telegram Bot API：<https://core.telegram.org/bots/api>
- Server 酱 Turbo：<https://sct.ftqq.com/>
- MiniMax API：<https://platform.minimax.io/document/Chatcompletion_v2>
- 赛程/球队生成脚本使用公开 2026 World Cup 数据集与公开 squad 页面，见 `scripts/pull-worldcup-data.mjs`

免责声明：本项目仅供信息分析与技术研究，不构成投资建议。预测市场和推送内容存在不确定性，请自行判断并遵守所在地区法律法规。
