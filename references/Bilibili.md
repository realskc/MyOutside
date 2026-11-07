# Bilibili（哔哩哔哩）

- 官网：https://www.bilibili.com
- 资料最近核对：2026-11-05

## 历史记录接口（非官方）

- 接口：`GET https://api.bilibili.com/x/web-interface/history/cursor`，用登录 cookie（`SESSDATA`）认证；每页最多 30 条，用游标（`max`、`business`、`view_at`）往前翻。可以按类型筛选：视频、直播、专栏。
- 每条记录有：标题、UP 主、子分区名、观看时间（`view_at`）、观看进度（`progress`，秒）、视频总时长（`duration`）、看到第几 P，以及在哪个平台看的（`dt`：手机、网页、平板、电视等）。
- 历史记录跟着账号走，所以手机 App 上看的也在里面。
- 这不是官方开放的接口，是社区项目 bilibili-API-collect 整理的（[历史记录文档](https://sessionhu.github.io/bilibili-API-collect/docs/historytoview/history.html)，2026-01-11 更新）；可能随时变化。
