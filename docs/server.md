# 云服务器

> 作者 2026-11-11 买的云服务器，用来部署 MyOutside（[platform.md「多端」](../user-spec/platform.md)、[D-0013](../user-spec/decisions/0013-cloud-kernel-for-multi-device.md)）。安全设置的依据见 [D-0087](../user-spec/decisions/0087-server-baseline-security.md)。
> 域名 **`myoutside.org`**（[D-0088](../user-spec/decisions/0088-domain-dns.md)）。连接：在作者的 Mac 上 `ssh ubuntu@myoutside.org`（密钥登录）。文档里不写 IP：IP 可能会换，以 DNS 为准。
> 最近一次核对：2026-11-11。

## 1. 配置

| 项 | 值 |
|---|---|
| 厂商 / 机房 | UCloud，香港（AS135377）；厂商的情况见 [references/UCloud.md](../references/UCloud.md) |
| 系统 | Ubuntu 24.04 LTS，内核 6.8.0-149（2026-11-11 升级后） |
| CPU / 内存 | 4 核 Intel Xeon（Cascade Lake，KVM 虚拟机）/ 8 GB |
| 硬盘 | 120 GB（系统盘，已用约 3 GB） |
| 交换 | 4 GB 交换文件 `/swapfile`，`vm.swappiness=10`（2026-11-11 加的，原来没有） |
| 网络 | 内网 10.7.0.0/16，公网地址经 NAT 映射；只有 IPv4，没有 IPv6（UCloud 香港能开 IPv6，但对 Ubuntu 不在官方支持范围、要另买带宽，见 [references/UCloud.md](../references/UCloud.md)） |
| 时区 | Asia/Hong_Kong（UTC+8，和北京时间相同） |
| 账号 | `ubuntu`（可免密码 sudo）；`root` 不能登录 |

## 2. 网络能力（2026-11-11 实测）

- 从服务器访问外网：Google、GitHub、npm、Hugging Face、DeepSeek API、网易云音乐、Docker Hub、Let's Encrypt 都能直接访问，不需要代理。PyPI 的索引页要 7 秒左右（页面大），能用。
- 带宽：从 Cloudflare 下载约 6.6 MB/s，上传约 4.3 MB/s（约 50 / 35 Mbps）。
- 只有 IPv6 的网络访问不了这台服务器（除非那个网络有 NAT64 转换）。作者学校的 WiFi 是双栈：除了 IPv6，还有 IPv4 内网地址（作者，2026-11-11），所以能访问。将来遇到真正只有 IPv6 的用户，办法见 D-0088「什么时候应该重新考虑」。
- 厂商的外网防火墙：从外面能连到 80、443（和 22）；3000、8080 连不上。所以厂商那层只放行了少数端口，具体规则在 UCloud 控制台里看。
- **作者的 Mac 到服务器延迟约 380–390 ms**（2026-11-11）：这台 Mac 是公司电脑，所有外网流量都走公司的出口（在洛杉矶），到香港要绕一圈美国。
  - 改不了：Mac 上的默认路由归公司的安全客户端管（它建的隧道 `utun4`）；绕开它直接走网卡，办公网本身也经公司的长途线路出去（路由追踪在第 4 跳多了约 180 ms），出口一样。硬绕会和公司的安全客户端冲突，作者说这种情况就算了。
  - 影响：在公司电脑上用部署后的 MyOutside，每次调用至少多 0.4 秒。设计时要尽量减少来回的次数（例如一次调用拿齐一屏的数据、界面先改再等确认）。别的网络（家里、手机热点、ThinkBook）没测过。

## 3. 域名与 DNS（D-0088）

域名在 Cloudflare 注册，DNS 也在 Cloudflare（权威服务器 `cameron.ns.cloudflare.com`、`cortney.ns.cloudflare.com`）。记录（2026-11-11）：

| 类型 | 名字 | 内容 | 作用 |
|---|---|---|---|
| A | `@`（`myoutside.org`） | 服务器的 IPv4 地址 | 域名指向服务器；**不走 Cloudflare 代理**（DNS only） |
| CNAME | `www` | `myoutside.org` | `www.myoutside.org` 是 `myoutside.org` 的别名；部署后由服务器跳转到 `myoutside.org` |
| TXT | `@` | `v=spf1 -all` | SPF：声明没有任何服务器可以用这个域名发邮件 |
| TXT | `_dmarc` | `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s` | DMARC：冒充这个域名（含子域名）的邮件，收件方应当拒收 |

- 没有 MX（不收邮件）、没有 AAAA（服务器没有 IPv6）。
- TTL 用 Auto（不走代理时是 5 分钟）。区域的「不存在」缓存时间（SOA 最后一项）是 1800 秒：一个名字在加记录前被查过，别处最多要等 30 分钟才查得到新记录。
- 查记录：**在服务器上**跑 `dig +noall +answer A myoutside.org @cameron.ns.cloudflare.com`（直接问权威服务器，不受缓存影响）。作者的 Mac 上不行：公司的安全客户端会截下本机所有 DNS 查询、用它自己的缓存回答，指定哪个 DNS 服务器都一样（2026-11-11 实测：发给不存在的 192.0.2.1 也有回答，TTL 是递减的缓存值）。

## 4. 安全设置（D-0087）

- **SSH**：`/etc/ssh/sshd_config.d/10-myoutside-hardening.conf`
  - 只允许密钥登录（`PasswordAuthentication no`），root 不能登录，最多试 4 次，登录限时 30 秒，关掉 X11 转发；
  - 例外：从 UCloud 控制台所在的内网 10.8.255.0/24 来的连接可以用密码（控制台的网页登录走这条路），留作后备；
  - 文件名排在 `50-cloud-init.conf` 前面：sshd 对同一项取第一次出现的值，cloud-init 那份里的 `PasswordAuthentication yes` 不生效。
  - 现在只有作者 Mac 的一把 ed25519 公钥在 `~ubuntu/.ssh/authorized_keys` 里；ThinkBook 要登录，得先把它的公钥加进去。
- **防火墙（ufw）**：默认拒绝所有进来的连接、允许出去的；放行 22/tcp（SSH）、80/tcp、443/tcp、443/udp（Caddy，见 §4）。
  - 坑：这个镜像里 `ufw.service` 默认是停用的，`ufw enable` 只改了配置，重启后防火墙不会起来。已经 `systemctl enable ufw`，重启验证过。
  - 以后如果用 Docker：Docker 直接改 iptables，会绕过 ufw；发布端口时要绑到 127.0.0.1，或者另行处理。
- **fail2ban**：`/etc/fail2ban/jail.d/myoutside.local`。SSH 10 分钟内失败 5 次封 1 小时（`mode = aggressive`）；一天内被封 5 次的封一周（`recidive`）。
- **自动安全更新**：`unattended-upgrades` 每天装安全更新，Caddy 的官方源也在内（`/etc/apt/apt.conf.d/51myoutside-caddy-upgrades`）；**不自动重启**（内核更新后要手动重启，`/var/run/reboot-required` 存在时就该重启了）。
- **没升级的包**：`cloud-init` 是 UCloud 改过的版本（`24.1.3-0ubuntu3.5ucloud`），升级会覆盖厂商的改动、可能影响控制台的功能（重置密码、网络配置等），留着不动；跟着它的 `distro-info`、`python3-distro-info` 也没升。

开通当天（2026-11-11，开机约 2 小时内），就有人在用密码爆破 SSH：一个地址试了约 370 次（root、ubuntu、admin、deploy……）。都失败了；成功的登录只有作者的密钥登录和一次控制台的密码登录。

## 5. 对外入口：Caddy（D-0089）

> 2026-11-11 第一次部署 MyOutside 后，`myoutside.org` 从占位页改成了转给 MyOutside 服务端（配置在仓库 `apps/server/deploy/Caddyfile`，部署时安装）。下面占位页那段是之前的样子，留作记录。

- Caddy 2.11.9（官方源，见 [references/Caddy.md](../references/Caddy.md)），systemd 服务 `caddy`，以 `caddy` 用户运行。
- 配置 `/etc/caddy/Caddyfile`（装好时的默认配置备份在 `Caddyfile.default`）：
  - `myoutside.org`：现在是占位页 `/var/www/myoutside/index.html`（「还在建设中」）；部署后改成反向代理到 MyOutside 的服务端；
  - `www.myoutside.org` → 301 到 `myoutside.org`（保留路径）；`http://` → 308 到 `https://`；
  - 去掉 `Server` 响应头，加 `X-Content-Type-Options`、`Referrer-Policy`。
- 证书：Let's Encrypt，两个域名各一张，90 天，Caddy 自动续期；存在 `/var/lib/caddy/.local/share/caddy/`。2026-11-11 第一次签发，到 2027-02-09。
- 改了配置：`sudo caddy validate --config /etc/caddy/Caddyfile` 检查，`sudo systemctl reload caddy` 生效。
- 现在的配置：`myoutside.org` → `reverse_proxy 127.0.0.1:8787`，请求体超过 4 KB 直接拒绝（D-0093）；`www` 照旧跳主域名。

## 6. MyOutside 服务端（docs/future/web-version.md）

- systemd 服务 `myoutside`（`/etc/systemd/system/myoutside.service`，来自仓库 `apps/server/deploy/`）：系统账号 `myoutside`（不能登录），只监听 `127.0.0.1:8787`，崩溃自动重启，开机自启。
- 沙箱：没有任何特权、过滤系统调用、系统目录只读、看不到家目录，只能写 `/var/lib/myoutside`；`systemd-analyze security myoutside` 评分 1.4（越低越好，2026-11-11）。
- Node 24（NodeSource 软件源，进自动安全更新：`/etc/apt/apt.conf.d/52myoutside-node-upgrades`）。
- 代码：`/opt/myoutside/releases/<时间>/`，`/opt/myoutside/current` 指向当前版本，只留最近 5 个。
- 数据：`/var/lib/myoutside/`（`platform.db` 账号与会话、`users/<用户 id>/myoutside.db` 每个用户的库、`secrets/master.key` 加密 API key 的主密钥），文件都只有 `myoutside` 能读写。
- 部署前的本地备份：`/var/backups/myoutside/pre-deploy-<时间>.tar.gz`（只留 10 份）；R2 加密备份程序在 `apps/server/scripts/backup.mjs`，配置完成后由 `myoutside-backup.timer` 每天香港时间凌晨 4 点运行（D-0092）。
- 登录的封禁：fail2ban 的 `myoutside` 规则（`/etc/fail2ban/filter.d/myoutside.conf`、`jail.d/myoutside-web.local`），只认服务端写的 `ban-request` 那一行，封 1 小时（D-0093）。
- 管理账号：`myoutside-admin create-user <用户名> [--admin]`、`myoutside-admin setup-link <用户名>`（打印设置链接；只在自己的终端里看）。
- 部署：在 Mac 上 `bash apps/server/scripts/deploy.sh`（每次都要作者明确同意，AGENTS.md 红线 4）；第一次准备服务器用 `apps/server/scripts/server-setup.sh`。

### R2 备份（D-0092）

R2 的 bucket、最小权限 token 和备份钥匙不放进仓库，也不通过聊天传递。配置时在服务器自己的终端运行：

```bash
sudo /opt/myoutside/current/apps/server/scripts/configure-backup.sh
```

脚本会把 R2 endpoint、bucket、Access Key、Secret Key 和 32 字节备份钥匙保存到只有 root 可读的 `/etc/myoutside/backup.env`、`/etc/myoutside/backup.key`。备份钥匙还要复制到作者自己的密码管理器。配置完成后：

```bash
sudo systemctl enable --now myoutside-backup.timer
sudo systemctl start myoutside-backup.service
sudo journalctl -u myoutside-backup.service -n 30 --no-pager
```

每次备份会对平台库和每个用户库做 SQLite 快照，压缩、AES-256-GCM 加密，上传后下载回来解密并检查压缩包。恢复演练使用新目录：

```bash
sudo -u root env MYOUTSIDE_BACKUP_KEY_FILE=/etc/myoutside/backup.key \
  node /opt/myoutside/current/apps/server/scripts/restore-backup.mjs <下载的备份文件> /var/tmp/myoutside-restore-check
```

## 7. 检查命令

```bash
sudo ufw status verbose                                  # 防火墙
sudo sshd -T | grep -E "^(passwordauthentication|permitrootlogin) "
sudo fail2ban-client status sshd                         # 封了谁
systemctl is-active unattended-upgrades apt-daily-upgrade.timer
ls /var/run/reboot-required                              # 有这个文件 = 该重启了
sudo ss -tulpn                                           # 在听哪些端口
systemctl status caddy; sudo journalctl -u caddy -n 50   # 入口和证书
systemctl status myoutside; sudo journalctl -u myoutside -n 50   # MyOutside 服务端
cat /opt/myoutside/current/VERSION                       # 现在跑的是哪个版本
curl -sI https://myoutside.org                           # 从外面看（在 Mac 上跑）
```
