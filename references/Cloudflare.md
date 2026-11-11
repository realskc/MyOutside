# Cloudflare

> 最近一次核对：2026-11-11。

做 CDN、DNS、网络安全的公司，也卖域名（Cloudflare Registrar）。MyOutside 的域名 `myoutside.org` 在这里注册、DNS 也在这里（[D-0088](../user-spec/decisions/0088-domain-dns.md)）。

## 买域名（2026-11-11 作者实际操作）

- 买完后的页面给四个选项：Manage domain（DNS、WHOIS 隐私、自动续费）、Deploy a site（用 Workers 部署网站）、Set up custom email（自定义邮箱与转发）、Register a new domain。
- 自动分配的权威 DNS 服务器：`cameron.ns.cloudflare.com`、`cortney.ns.cloudflare.com`（各个账号分到的名字不同）。
- 新域名加了记录后，几分钟内公共 DNS（1.1.1.1、8.8.8.8）就能查到（在服务器上查的）。
- 区域的 SOA 记录里，「不存在」的缓存时间是 1800 秒（实测）。
- **自动续费**（[Renew domains](https://developers.cloudflare.com/registrar/account-options/renew-domains/)）：默认开着。文档说在 **Manage domains** 页面（`https://dash.cloudflare.com/?to=/:account/registrar/domains`）每个域名有 Auto-renew 开关；但 2026-11 的后台里这个链接会跳到 **Domains → Overview**（列的是网站这一侧：状态、访客、套餐，没有续费设置），注册相关的在左侧菜单 **Domains → Registrations**（`/<账号 id>/domains/registrations`）里，Auto-renew 就在这一页（作者 2026-11-11 确认：`myoutside.org` 的自动续费开着）。到期前约 30 天第一次尝试续费，失败了再试几次，最后一次在到期前一天；失败会发邮件。按注册局的原价续，不加价。要靠账号里能扣款的支付方式。

## DNS 记录的代理（橙色云朵）

- 加 A / AAAA / CNAME 记录时默认是「Proxied」：访问先到 Cloudflare 的节点，再由它转到源站。关掉就是「DNS only」（灰色云朵），只做名字解析。
- 走代理时，Cloudflare 在它的节点上终止 HTTPS，再连源站，所以能看到明文内容；查询这个域名得到的是 Cloudflare 的 IP，源站 IP 被隐藏。
- 有记录是 DNS only 时，后台会一直提示「Proxying is required for most security and performance features」，劝你打开代理（防大流量攻击、安全规则、缓存等）。
- 「Redirect rule」（跳转规则）这类功能要求走代理（推断：后台的说明是这么写的，没有逐个核实）。
- Auto TTL：DNS only 的记录，权威服务器返回的 TTL 是 300 秒（实测）。
- 常见说法：免费版的代理在中国大陆访问时，常被分到海外节点，速度不稳定（没有核实）。
- **IPv6**：走代理的记录，Cloudflare 默认自动给出它自己的 IPv4 和 IPv6 地址（自动生成 AAAA），免费版也一样，非企业版关不掉；所以源站只有 IPv4 时，只有 IPv6 的访客也能经 Cloudflare 访问（[IPv6 compatibility](https://developers.cloudflare.com/network/ipv6-compatibility/)）。源站同时有 IPv4 和 IPv6 时，Cloudflare 优先用 IPv4 连源站。DNS only 的记录没有这个效果。
- **走代理时的限制**（2026-11-11 查的官方文档）：
  - 单个请求最大上传 100 MB（Free、Pro；Business 200 MB）；更大的要分块，或走 DNS only 的记录（[Default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)）；
  - 源站 125 秒内没有响应就报 524（Proxy Read Timeout，非企业版不能改）；连接空闲 900 秒断开（[Connection limits](https://developers.cloudflare.com/fundamentals/reference/connection-limits/)）。

## 后台给的建议（作者在 2026-11-11 看到的）

- 「Visitors cannot reach www.myoutside.org」：建议给 `www` 加 A / AAAA / CNAME，并可以用跳转规则跳到主域名；
- 「Visitors cannot reach myoutside.org」：建议给主域名加记录；A 记录已经生效后仍显示过一阵（推断：后台的检查不是实时的）；
- 「Email cannot reach @myoutside.org addresses and they could be spoofed」：建议加 MX 收信，加 SPF、DKIM、DMARC 防冒充。
