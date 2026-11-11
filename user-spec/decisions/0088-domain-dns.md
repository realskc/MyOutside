# D-0088 域名 myoutside.org 的 DNS：不走 Cloudflare 代理，www 作别名，声明不发邮件

- 状态：有效
- 日期：2026-11-11
- 决策者：agent 提议，作者照着设置了
- 服务于：
  - 作者预期：[platform.md「多端」](../platform.md)（`myoutside.org` 是 MyOutside 的正式域名，以后提供公开 SaaS 服务也可以用；以后分发给作者的同学）
  - 上游决策：[D-0087](0087-server-baseline-security.md)（云服务器的基本安全设置）

## 背景

作者 2026-11-11 在 Cloudflare 买了 `myoutside.org`，第一次买域名。Cloudflare 加记录时默认打开代理（橙色云朵），并且一直提示「Proxying is required for most security and performance features」。

## 决策

- **A 记录 `@` → 服务器的 IPv4，不走代理**（DNS only，灰色云朵）。理由：
  - 走代理时 Cloudflare 会解开 HTTPS 再转发，作者和服务器之间的内容它都能看到；不走代理，证书在我们自己的服务器上申请，只有服务器能解开；
  - 作者和同学在国内，直连香港服务器更快；Cloudflare 免费版的代理节点在国内访问常常更慢（常见说法，没有核实）；
  - 服务器的 IP 本来就公开了（开机两小时就有人在扫），隐藏 IP 的意义不大。
- **`www` 用 CNAME 指向 `myoutside.org`**，不走代理；部署后由服务器把 `www.myoutside.org` 跳转到 `myoutside.org`（不用 Cloudflare 的跳转规则——它要开代理才能用）。
- **声明这个域名不发邮件**，防止别人冒充 `@myoutside.org` 发钓鱼邮件（例如以后冒充 MyOutside 给同学发「请重新登录」）：
  - `@` 的 TXT：`v=spf1 -all`（SPF：没有任何服务器可以用这个域名发信）；
  - `_dmarc` 的 TXT：`v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s`（DMARC：没通过检查的邮件，包括子域名的，收件方应当拒收）；
  - 不加 MX：现在不收邮件。
- 服务器没有 IPv6，不加 AAAA。

## 考虑过、没有采用

- **打开 Cloudflare 代理**：能防大流量攻击、能隐藏 IP、有缓存和安全规则；代价见上。个人用、用户是同学，被大流量攻击的可能小；真遇到了再打开。
- **只给 IP 签证书、不买域名**（Let's Encrypt 的 IP 证书，6 天一续）：作者买了域名，不需要了。

## 代价

- 没有 Cloudflare 的防攻击和缓存；服务器直接面对外网，安全靠服务器自己（D-0087）。

## 什么时候应该重新考虑

- 被大流量攻击，或者想隐藏服务器的 IP 时（打开代理）；
- 有用户在真正只有 IPv6 的网络里（没有 NAT64）时：打开代理，Cloudflare 会自动给出 IPv6 地址、再用 IPv4 连服务器；也可以只给一个专用子域名开代理，主域名照旧直连。走代理时单个请求最多上传 100 MB、源站 125 秒不响应就断（纯蓝上传音频、长时间的调用要注意），见 [references/Cloudflare.md](../../references/Cloudflare.md)。作者学校的 WiFi 是双栈，目前不需要；
- 要用这个域名发邮件时（例如第 3 步注册登录要发验证码）：改 SPF、加 DKIM，按发信服务商的要求设置；
- 部署 HTTPS 时：可以加 CAA 记录，只允许 Let's Encrypt 给这个域名签证书；
- 提供公开 SaaS 服务、用户多起来时。

## 怎么验证

在服务器上查（作者的 Mac 上的 DNS 查询会被公司的安全客户端截下来，用它的缓存回答，见 `docs/server.md` §3）：

- `dig +short A myoutside.org @cameron.ns.cloudflare.com` 返回的是服务器的 IP（走代理时会是 Cloudflare 的 IP），TTL 300；
- `dig +short TXT myoutside.org`、`dig +short TXT _dmarc.myoutside.org` 能查到上面两条；
- `ssh ubuntu@myoutside.org` 能连上，主机密钥和直接用 IP 连时相同。

## 相关文档

- `docs/server.md` §3
