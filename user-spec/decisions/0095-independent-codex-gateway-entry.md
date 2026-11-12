# D-0095 Caddy 保留独立 CodexGateway 的入口

- 状态：有效
- 日期：2026-11-12
- 决策者：agent
- 服务于：作者要求个人 Codex 中转与 MyOutside 隔离，并明确授权部署（2026-11-12）；上游 [D-0089](0089-caddy-as-front.md)。

## 决策

CodexGateway 在独立仓库开发，独立系统用户、服务、目录，监听 127.0.0.1:8788。MyOutside 仍使用 8787。Caddy 的 /codex-gateway/* 路径去掉前缀后转给 Gateway，限制 8 MB；其他路径转给 MyOutside，仍限制 4 KB。

同步本仓库发布配置以保留这个入口，否则下次部署会覆盖线上 Gateway 路由。Gateway 凭据不属于 MyOutside，不接入子应用、平台 API 或备份。

## 代价

两个仓库目前共享完整 Caddy 配置，未来修改入口须核对双方；增多服务时可改为分文件 import。本次只热重载 Caddy，没有重启 MyOutside。
