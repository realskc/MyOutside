# Cloudflare

> 最近一次核对：2026-11-13（R2 部分）；其余 2026-11-11。

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

## R2（对象存储）

- 价格（[R2 pricing](https://developers.cloudflare.com/r2/pricing/)，2026-11-11 查）：免费额度每月 10 GB 存储、100 万次写类操作、1000 万次读类操作，下载（流出流量）不收费；超出后标准存储 $0.015 / GB·月。
- **开通**（[Get started](https://developers.cloudflare.com/r2/get-started/)，2026-11-13 查）：后台左侧 **Storage & databases → R2 → Overview**，走一次结账流程给账号加上 R2 订阅；有免费额度，按月按用量计费。没开通之前建不了令牌。推断：结账要账号里有能扣款的支付方式（没核实）。
- **建桶**：桶名只能用小写字母、数字和 `-`，3–63 个字符，不能以 `-` 开头或结尾。建桶时选了 Jurisdiction（EU、FedRAMP、US）的桶，只能用对应的专用地址访问（`https://<账号 id>.eu.r2.cloudflarestorage.com` 等）。
- **令牌**（[Authentication](https://developers.cloudflare.com/r2/api/tokens/)，2026-11-13 查）：R2 Overview → **Account Details** 里 **API Tokens** 旁的 **Manage**，可以建 Account API token（属于账号，手动撤销或到期前一直有效）或 User API token（属于个人，人被移出账号就失效）。权限四种：Admin Read & Write（建删桶、改桶的配置、读写对象）、Admin Read only、**Object Read & Write**（只能读、写、列出指定桶里的对象）、Object Read only；后两种可以限定到某几个桶，只能用于 S3 接口。建好后显示 Access Key ID 和 Secret Access Key，Secret 只显示这一次。Access Key ID 是令牌的 id，Secret 是令牌值的 SHA-256（十六进制）。S3 地址是 `https://<账号 id>.r2.cloudflarestorage.com`。
- **自动删除（Object lifecycles）**（[文档](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)）：后台在桶的 **Settings → Object lifecycle rules**。按前缀（相当于文件夹）设规则，例如「上传满 90 天就删」；到期后一般 24 小时内删掉。每个桶自带一条「分块上传开始 7 天后没完成就中止」。改这些规则是桶级操作，要 `Workers R2 Storage Write` 权限（即 Admin 类令牌）。
- **锁定（Bucket locks）**（[文档](https://developers.cloudflare.com/r2/buckets/bucket-locks/)）：后台在桶的 **Settings → Bucket lock rules**。按前缀设保留期（多少天、到某一天，或永久），期间对象不能被删除、覆盖，也不会被自动删除规则删掉（锁定优先）；不影响上传新对象。同一个对象有多条规则时取最长的。被锁住时单个删除 / 覆盖返回 409 `ObjectLockedByBucketPolicy`。有锁定规则的桶不能清空。改锁定规则要「能改桶配置」的权限；Object Read & Write 令牌只能读写对象，改不了锁定和自动删除规则（2026-11-13 按上面令牌文档的权限说明核对）。
- **aws 命令行**（[aws CLI](https://developers.cloudflare.com/r2/examples/aws/aws-cli/)）：`--endpoint-url https://<账号 id>.r2.cloudflarestorage.com`，region 填 `auto`。2025 年初 aws 命令行默认加 CRC 校验头时 R2 曾报错，当时的绕法是 `AWS_REQUEST_CHECKSUM_CALCULATION=when_required`；2026-10 的官方示例已经不提这件事。推断：R2 已经支持（没实测；第一次备份时会知道）。
- 用途：MyOutside 服务器数据库的异地加密备份（[D-0092](../user-spec/decisions/0092-backup-to-r2.md)、[D-0096](../user-spec/decisions/0096-backup-completion-and-fixes.md)；操作步骤见 [docs/server.md「R2 备份」](../docs/server.md)）。

## 后台给的建议（作者在 2026-11-11 看到的）

- 「Visitors cannot reach www.myoutside.org」：建议给 `www` 加 A / AAAA / CNAME，并可以用跳转规则跳到主域名；
- 「Visitors cannot reach myoutside.org」：建议给主域名加记录；A 记录已经生效后仍显示过一阵（推断：后台的检查不是实时的）；
- 「Email cannot reach @myoutside.org addresses and they could be spoofed」：建议加 MX 收信，加 SPF、DKIM、DMARC 防冒充。
