# Caddy

> 最近一次核对：2026-11-11。

用 Go 写的网页服务器 / 反向代理，特点是**自动 HTTPS**：配置里写上域名，它就自己去申请证书、到期前续期，`http` 自动跳到 `https`。MyOutside 服务器的对外入口用它（[D-0089](../user-spec/decisions/0089-caddy-as-front.md)）。

## 安装（Ubuntu 24.04，2026-11-11 实际操作）

- 官方软件源托管在 Cloudsmith：密钥 `https://dl.cloudsmith.io/public/caddy/stable/gpg.key`，源列表 `https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt`。装到的版本是 2.11.9；Ubuntu 24.04 自带的 caddy 包是 2.6.2（`apt-cache madison caddy` 查到 `2.6.2-6ubuntu0.24.04.3`）。
- 这个源在 apt 里的来源标记是 `o=cloudsmith/caddy/stable`；要让 `unattended-upgrades` 自动更新它，在 `Origins-Pattern` 里加 `"origin=cloudsmith/caddy/stable"`。
- 装完自动启用 systemd 服务，以 `caddy` 用户运行；证书和账号密钥放在 `/var/lib/caddy/.local/share/caddy/`。
- 默认的 `/etc/caddy/Caddyfile` 只在 80 端口放一个欢迎页。

## 行为（实测）

- 配好域名后十几秒内拿到了 Let's Encrypt 的证书（签发者 `YE2`，有效期 90 天），日志里是「certificate obtained successfully」。
- 默认就开 HTTP/3：响应头带 `alt-svc: h3=":443"`。
- `http://` 跳 `https://` 用的是 308。
- 文档说默认的证书机构是 Let's Encrypt，失败时改用 ZeroSSL（agent 记得的，没在文档里逐字核对）。
