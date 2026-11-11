# Cloudflare

> 最近一次核对：2026-11-11。

做 CDN、DNS、网络安全的公司，也卖域名（Cloudflare Registrar）。MyOutside 的域名 `myoutside.org` 在这里注册、DNS 也在这里（[D-0088](../user-spec/decisions/0088-domain-dns.md)）。

## 买域名（2026-11-11 作者实际操作）

- 买完后的页面给四个选项：Manage domain（DNS、WHOIS 隐私、自动续费）、Deploy a site（用 Workers 部署网站）、Set up custom email（自定义邮箱与转发）、Register a new domain。
- 自动分配的权威 DNS 服务器：`cameron.ns.cloudflare.com`、`cortney.ns.cloudflare.com`（各个账号分到的名字不同）。
- 新域名加了记录后，几分钟内公共 DNS（1.1.1.1、8.8.8.8）就能查到（在服务器上查的）。
- 区域的 SOA 记录里，「不存在」的缓存时间是 1800 秒（实测）。

## DNS 记录的代理（橙色云朵）

- 加 A / AAAA / CNAME 记录时默认是「Proxied」：访问先到 Cloudflare 的节点，再由它转到源站。关掉就是「DNS only」（灰色云朵），只做名字解析。
- 走代理时，Cloudflare 在它的节点上终止 HTTPS，再连源站，所以能看到明文内容；查询这个域名得到的是 Cloudflare 的 IP，源站 IP 被隐藏。
- 有记录是 DNS only 时，后台会一直提示「Proxying is required for most security and performance features」，劝你打开代理（防大流量攻击、安全规则、缓存等）。
- 「Redirect rule」（跳转规则）这类功能要求走代理（推断：后台的说明是这么写的，没有逐个核实）。
- Auto TTL：DNS only 的记录，权威服务器返回的 TTL 是 300 秒（实测）。
- 常见说法：免费版的代理在中国大陆访问时，常被分到海外节点，速度不稳定（没有核实）。

## 后台给的建议（作者在 2026-11-11 看到的）

- 「Visitors cannot reach www.myoutside.org」：建议给 `www` 加 A / AAAA / CNAME，并可以用跳转规则跳到主域名；
- 「Visitors cannot reach myoutside.org」：建议给主域名加记录；A 记录已经生效后仍显示过一阵（推断：后台的检查不是实时的）；
- 「Email cannot reach @myoutside.org addresses and they could be spoofed」：建议加 MX 收信，加 SPF、DKIM、DMARC 防冒充。
