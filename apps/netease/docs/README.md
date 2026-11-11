# 网易云下载（netease）技术文档

> 应用 id `netease`。作者预期见 [`../user-spec/README.md`](../user-spec/README.md)；决策见 [`../user-spec/decisions/README.md`](../user-spec/decisions/README.md)（主要是 [NETEASE-0001](../user-spec/decisions/NETEASE-0001-search-and-download.md)、[NETEASE-0002](../user-spec/decisions/NETEASE-0002-download-rate-limit.md)）。

## 1. 组成

- **后端** `backend/src/`：
  - `index.ts`：`createNeteaseApp({ cookiePaths?, defaultDownloadDir?, fetch?, downloadGapMs?, dailyLimit?, now?, random? })`，表、API、下载排队；
  - `cookies.ts`：解析 Apple 二进制 Cookie，读 `MUSIC_U`；
  - `client.ts`：网易云的四个接口和 CDN 下载（校验大小、MD5）；
  - `files.ts`：官方式文件名、列下载文件夹。
- **界面** `ui/`：静态 HTML / CSS / JS，中英双语。
- 不需要 Python 或别的外部程序。

## 2. API

| 函数 | 类型 | 可见性 | 说明 |
|---|---|---|---|
| `netease.getStatus` | 只读 | 内部 | 有没有读到官方客户端的登录状态（不联网）、下载文件夹、今天下了几首 / 上限、下一首最早开始时间、排队数 |
| `netease.search` | 只读 | 内部 | 搜歌，每首带本账号能下的最高档位 `maxLevel` |
| `netease.download` | 普通异步函数 | 内部 | 下载一首歌：在应用内部排队，一次一首，上一首结束后随机等 10–20 秒，每天最多 50 首（NETEASE-0002）；进度事件 `{ type: "progress", progress, message }`，排队时带 `queued`，等待时带 `waitUntil`；最后一条消息括号里说明歌词情况 |
| `netease.insertDownload` | 事务 | 内部 | 记一条下载记录（`download` 调用） |
| `netease.listHistory` | 只读 | 内部 | 最近 100 条下载记录（只有真正下载了的） |
| `netease.setDownloadDir` | 事务 | 内部 | 改下载文件夹（绝对路径）；`null` 恢复默认 |
| `netease.listDownloadedFiles` | 只读 | **公开** | 下载文件夹里的音频（不进子文件夹）和同名 `.lrc`，新的在前 |

## 3. 数据

- 表 `setting`（`key`、`value`）：目前只有 `download_dir`；
- 表 `download`（只记真正下载了的；每天的额度、重启后的间隔都按它算）：`song_id`、`name`、`artists`（JSON）、`album`、`level`、`bitrate`、`file`（绝对路径）、`lyric_file`、`size`、`created_at`；
- 音频和歌词不在应用目录里，在下载文件夹（默认 `~/Music/网易云音乐`）。

## 4. 网易云接口（2026-11-11 核对）

- 主机 `https://interface.music.163.com`，表单 POST；Cookie `MUSIC_U=<官方客户端的>; os=osx`（`os=osx` 缺了，部分无损地址会被 CDN 拒）；
- `/api/cloudsearch/pc`：`s`、`type=1`、`limit`、`offset`、`total=true`；结果里每首带 `privilege`；
- `/api/v3/song/detail`：`c=[{"id":…}]`、`ids=[…]`；`privileges[0].dlLevel` 是能下的最高档位（`standard` / `higher` / `exhigh` / `lossless` / `hires`，不认识的按 `hires`），`st < 0` 表示不能下；
- `/api/song/enhance/download/url/v1`：`id`、`level`、`immerseType=c51`；返回 `url`（`*.music.126.net`）、`size`、`md5`、`type`（mp3 / flac）、`level`、`br`；有 `freeTrialInfo` 的是试听片段，拒绝；
- `/api/song/lyric`：`id`、`lv=-1`、`kv=-1`、`tv=-1`；`lrc.lyric` 是标准 LRC；
- CDN：改成 https、不跟随跳转、不带 Cookie。

## 5. 外壳

- `window.outside.pickFolder()`：选文件夹；
- `window.outside.revealPath(path)`：文件在访达里显示，文件夹直接打开。

## 6. 检查

- 单测 `pnpm --filter ./apps/netease test`：假 Cookie 文件 + 假网络；
- 冒烟 `netease`：不给 Cookie 位置，不联网；
- 真实账号只手动检查，下载到临时目录。

## 7. 限制

- 下载：一次一首，相邻两首随机隔 10–20 秒（按上一首结束算），每天最多 50 首（本地时间零点起算）；
- 只支持 macOS；
- 下载不是公开 API（D-0063），纯蓝只能读下载文件夹；
- 没有批量下载、歌单、播放。
