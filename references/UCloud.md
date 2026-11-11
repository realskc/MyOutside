# UCloud（优刻得）

> 最近一次核对：2026-11-11。大部分是在作者买的香港云服务器上实测或观察到的，不是官方文档；推断的地方标了「推断」。我们自己服务器的设置见 [docs/server.md](../docs/server.md)。

中国的云服务商。作者 2026-11-11 在它的香港机房买了一台云服务器，部署 MyOutside 用。

## 香港机房的服务器（实测）

- 公网地址属于 AS135377「UCLOUD INFORMATION TECHNOLOGY (HK) LIMITED」（[ipinfo.io](https://ipinfo.io) 查到）；服务器本身只有内网地址（10.7.0.0/16），公网地址经 NAT 映射；没有 IPv6。
- 内网 DNS：10.8.255.1、10.8.255.2，外加 8.8.8.8。
- 从服务器能直接访问 Google、GitHub、npm、Hugging Face、Docker Hub 等，不需要代理。
- 厂商有一层外网防火墙：从外面能连到 22、80、443，连不到 3000、8080（在服务器上开着监听、本机防火墙关着的情况下测的）。规则在控制台里配。

## Ubuntu 24.04 镜像的特点（实测）

- 开机后 SSH **允许密码登录**（`/etc/ssh/sshd_config.d/50-cloud-init.conf` 里写着 `PasswordAuthentication yes`），`root` 和 `ubuntu` 都设了密码；`root` 只允许密钥登录（`permitrootlogin without-password`），但没有放公钥。
- `ufw` 装了，但 `ufw.service` 是停用的：`ufw enable` 只改配置，重启后防火墙不会起来，要另外 `systemctl enable ufw`。没在 cloud-init 配置里找到停用它的地方（推断：镜像本身就是停用的）。
- `cloud-init` 是厂商改过的版本 `24.1.3-0ubuntu3.5ucloud`，`apt` 升级时被留着不升（新版本是官方的）。
- 没装 `unattended-upgrades`，没有交换空间。
- 时区预设为 Asia/Hong_Kong。
- `ubuntu` 账号可以免密码 sudo。

## 控制台登录

- 2026-11-11 观察到一次从 10.8.255.54 用密码通过 SSH 登录 `ubuntu` 的记录，时间在作者配好密钥之前（推断：这是控制台的网页登录，它从厂商内网 10.8.255.0/24 用 SSH 连进来）。
- 推断：控制台另有 VNC 方式的登录，不经过 SSH，SSH 设置出问题时可以用它（没验证）。
