# 微信 ClawBot（iLink）

- 资料最近核对：2026-11-05

## 是什么

- 2026 年 3 月，微信上线「ClawBot」插件（入口：我 → 设置 → 插件），第一次给个人微信号提供官方的机器人接入方式。底层协议叫 iLink，接入域名是腾讯的 `ilinkai.weixin.qq.com`；腾讯发布了 npm 包 `@tencent-weixin/openclaw-weixin`（作为 OpenClaw 这个 AI agent 框架的渠道插件），并有专门的《微信ClawBot功能使用条款》。（[知乎，2026-03-23](https://zhuanlan.zhihu.com/p/2019677743126704371)；[协议解析](https://github.com/hao-ji-xing/openclaw-weixin/blob/main/weixin-bot-api.md)）
- 用法：程序申请一个二维码，用手机微信扫码确认，拿到 `bot_token`；之后用长轮询（`getupdates`）收消息，用 `sendmessage` 回复。微信的聊天列表里会出现一个叫「微信ClawBot」的机器人，像好友一样和它对话。（[腾讯云开发者社区，2026-06-12](https://cloud.tencent.com/developer/article/2687269)；[AstrBot 文档](https://docs.astrbot.app/platform/weixin_oc.html)）
- 支持文本、图片、视频、文件的收发；语音可以收（微信云端自动转成文字），不能发。（AstrBot 文档）

## 限制

- 只能私聊，机器人不能进群。
- 只能回复用户先发来的消息，不能主动发起对话：回复要带上收到的消息里的 `context_token`；用户超过 24 小时没发消息，就无法再回复。（[CSDN，2026-07-16](https://damodev.csdn.net/6a58e3af10ee7a33f28e365c.html)）
- 腾讯分批灰度开放，账号的插件列表里出现入口才能用；需要较新的手机微信（AstrBot 文档写的是 iOS 8.0.70 以上、Android 8.0.69 以上）。（[七牛云，2026-08-27](https://news.qiniu.com/archives/1787733470435)）
- 它是用户和机器人之间的对话，不是让程序以用户的身份给其他好友发消息。

## 在它之前

- 个人微信号没有官方接口，程序控制微信只能靠逆向协议（如 iPad 协议）或注入电脑版微信进程，属于违反协议、有封号风险的做法；企业微信有官方接口，但只面向企业微信的成员和客户。（同上协议解析）
