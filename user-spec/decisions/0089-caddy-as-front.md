# D-0089 服务器的对外入口用 Caddy：自动 HTTPS，先放占位页

- 状态：有效（2026-11-11 第一次部署 MyOutside 后，占位页换成了转给服务端，见 `docs/server.md` §5）
- 日期：2026-11-11
- 决策者：agent（作者问「下一步搞证书吗」）
- 服务于：
  - 作者预期：[platform.md「多端」](../platform.md)（把 MyOutside 部署到服务器；`myoutside.org` 是正式域名）
  - 上游决策：[D-0087](0087-server-baseline-security.md)（服务器的安全设置）、[D-0088](0088-domain-dns.md)（DNS 不走 Cloudflare 代理，证书在自己的服务器上申请）

## 背景

不论第 2 步的架构怎么定，服务器前面都要有一个接待访客、管 HTTPS 证书的程序，再把请求转给 MyOutside 的服务端。这一层和架构无关，可以先做。

## 决策

- 用 **Caddy**（官方软件源，2026-11-11 装的是 2.11.9）。它自动向 Let's Encrypt 申请证书、到期前自动续期，`http` 自动跳 `https`，配置只有几行。
- 配置 `/etc/caddy/Caddyfile`：
  - `myoutside.org`：现在只是一个「还在建设中」的占位页（`/var/www/myoutside/index.html`）；部署 MyOutside 后改成反向代理到服务端；
  - `www.myoutside.org`：永久跳转到 `myoutside.org`（保留路径）；
  - 去掉 `Server` 响应头，加 `X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`。
- 防火墙放行 80/tcp（证书验证和跳转）、443/tcp（HTTPS）、443/udp（HTTP/3；厂商防火墙放不放行 UDP 没测，不通时浏览器会自动退回 HTTP/2）。
- Caddy 的软件源加进自动更新（`/etc/apt/apt.conf.d/51myoutside-caddy-upgrades`）：它是直接面对外网的程序。
- 申请证书不留邮箱：Let's Encrypt 已经不发到期提醒邮件，续期是自动的。

## 考虑过、没有采用

- **nginx + certbot**：更常见，但要两样东西配合，续期靠定时任务；Caddy 一样东西就够了。
- **Ubuntu 自带的 caddy 包**：版本旧（2.6），更新慢。
- **现在就加 HSTS**（让浏览器以后只用 HTTPS 访问）：更安全，但一旦设上，证书出问题时浏览器不让绕过；等 MyOutside 真正部署、稳定后再加。

## 代价

- 多了一个第三方软件源（Caddy 官方，托管在 Cloudsmith）。
- 占位页是公开的：任何人访问 `myoutside.org` 都能看到「还在建设中」。

## 什么时候应该重新考虑

- 部署 MyOutside 时：改成反向代理，并按需要设置上传大小、超时；考虑加 HSTS；
- 想限制只有哪些证书机构能给这个域名签证书时：在 Cloudflare 加 CAA 记录（Caddy 默认也可能改用 ZeroSSL，加 CAA 时要一起考虑，推断）；
- 需要 Caddy 做不到的事时。

## 怎么验证

- 从外面：`https://myoutside.org` 返回 200 和占位页，证书由 Let's Encrypt 签发；`https://www.myoutside.org/abc` 301 到 `https://myoutside.org/abc`；`http://` 308 到 `https://`。
- 在服务器上：`systemctl is-enabled caddy` 是 enabled；`journalctl -u caddy` 里有「certificate obtained successfully」。

## 相关文档

- `docs/server.md` §5
