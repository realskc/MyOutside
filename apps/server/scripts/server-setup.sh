#!/usr/bin/env bash
# 服务器的一次性准备（docs/future/web-version.md §5）：在服务器上以 root 运行，可以重复运行。
#   Node 24（NodeSource 软件源，进自动安全更新）、系统账号 myoutside、代码与数据目录。
# 服务配置、Caddy、fail2ban 规则由每次部署的 activate-release.sh 安装。
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

if ! command -v node >/dev/null 2>&1 || ! node --version | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/nodesource.gpg
  echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
apt-get install -y -qq nodejs
fi

if ! command -v aws >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq unzip
  aws_tmp="$(mktemp -d)"
  trap 'rm -rf "$aws_tmp"' EXIT
  curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o "$aws_tmp/awscliv2.zip"
  unzip -q "$aws_tmp/awscliv2.zip" -d "$aws_tmp"
  "$aws_tmp/aws/install" --update
  rm -rf "$aws_tmp"
  trap - EXIT
fi

# NodeSource 的来源名是「. nodistro」，按网站认
cat > /etc/apt/apt.conf.d/52myoutside-node-upgrades <<'CONF'
// MyOutside：Node 是服务端的运行环境，也跟着自动更新（同一个大版本内）
Unattended-Upgrade::Origins-Pattern {
        "site=deb.nodesource.com";
};
CONF

if ! id myoutside >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/myoutside --no-create-home --shell /usr/sbin/nologin myoutside
fi
install -d -m 0700 -o myoutside -g myoutside /var/lib/myoutside
install -d -m 0755 /opt/myoutside /opt/myoutside/releases
install -d -m 0700 /var/backups/myoutside
install -d -m 0700 /var/lib/myoutside-backup-work
echo "准备好了：node $(node --version)，账号 myoutside，数据 /var/lib/myoutside"
