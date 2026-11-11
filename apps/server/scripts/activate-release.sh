#!/usr/bin/env bash
# 在服务器上启用一个新的发布包（由 deploy.sh 以 root 调用；docs/future/web-version.md §6）。
# 每次部署都要作者明确同意（AGENTS.md 红线 4）。
#   1. 把上传的包放进 /opt/myoutside/releases/<时间>/（只有 root 能改）
#   2. 装好服务配置、管理命令、fail2ban 规则（有变化才换）
#   3. 停服务（会先等进行中的调用结束）→ 备份数据 → 换成新版本 → 启动 → 检查；没起来就切回上一个版本
#   4. 服务好了以后，Caddy 改成转给服务端（有变化才换）
set -euo pipefail
ts="$1"
upload="/home/ubuntu/myoutside-upload/$ts"
release="/opt/myoutside/releases/$ts"
[ -d "$upload" ] || { echo "没有上传的包：$upload"; exit 1; }

install -d -m 0755 /opt/myoutside /opt/myoutside/releases
rm -rf "$release"
cp -a "$upload" "$release"
rm -rf "$upload"
chown -R root:root "$release"
chmod -R u=rwX,go=rX "$release"

deploy="$release/apps/server/deploy"
unit_changed=0
if ! cmp -s "$deploy/myoutside.service" /etc/systemd/system/myoutside.service; then
  install -m 0644 "$deploy/myoutside.service" /etc/systemd/system/myoutside.service
  unit_changed=1
fi
install -m 0755 "$deploy/myoutside-admin" /usr/local/bin/myoutside-admin
f2b_changed=0
if ! cmp -s "$deploy/fail2ban-filter.conf" /etc/fail2ban/filter.d/myoutside.conf; then
  install -m 0644 "$deploy/fail2ban-filter.conf" /etc/fail2ban/filter.d/myoutside.conf
  f2b_changed=1
fi
if ! cmp -s "$deploy/fail2ban-jail.local" /etc/fail2ban/jail.d/myoutside-web.local; then
  install -m 0644 "$deploy/fail2ban-jail.local" /etc/fail2ban/jail.d/myoutside-web.local
  f2b_changed=1
fi
[ "$unit_changed" = 1 ] && systemctl daemon-reload

previous="$(readlink -f /opt/myoutside/current 2>/dev/null || true)"
if systemctl is-active --quiet myoutside; then
  echo "停止服务（等进行中的调用结束，最多 30 秒）"
  systemctl stop myoutside
fi

# 部署前备份：D-0092 的异地备份落地之前，先在服务器本地留一份（只留最近 10 份）
if [ -f /var/lib/myoutside/platform.db ]; then
  install -d -m 0700 /var/backups/myoutside
  tar -czf "/var/backups/myoutside/pre-deploy-$ts.tar.gz" -C /var/lib myoutside
  chmod 0600 "/var/backups/myoutside/pre-deploy-$ts.tar.gz"
  ls -1t /var/backups/myoutside/pre-deploy-*.tar.gz | tail -n +11 | xargs -r rm -f
  echo "已备份数据：/var/backups/myoutside/pre-deploy-$ts.tar.gz"
fi

switch_to() {
  ln -sfn "$1" /opt/myoutside/current.new
  mv -T /opt/myoutside/current.new /opt/myoutside/current
}
switch_to "$release"
systemctl enable myoutside >/dev/null 2>&1
systemctl restart myoutside

healthy=0
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:8787/; then healthy=1; break; fi
  sleep 1
done
if [ "$healthy" != 1 ]; then
  echo "检查失败：服务没有起来"
  journalctl -u myoutside -n 30 --no-pager || true
  if [ -n "$previous" ] && [ "$previous" != "$release" ]; then
    switch_to "$previous"
    systemctl restart myoutside
    echo "已切回上一个版本：$previous"
  fi
  exit 1
fi

if ! cmp -s "$deploy/Caddyfile" /etc/caddy/Caddyfile; then
  caddy adapt --config "$deploy/Caddyfile" --adapter caddyfile >/dev/null
  install -m 0644 "$deploy/Caddyfile" /etc/caddy/Caddyfile
  systemctl reload caddy
  echo "Caddy 已改成转给服务端"
fi
if [ "$f2b_changed" = 1 ]; then fail2ban-client reload >/dev/null && echo "fail2ban 规则已更新"; fi

# 只留最近 5 个版本
ls -1dt /opt/myoutside/releases/*/ | tail -n +6 | xargs -r rm -rf
echo "部署完成：$(cat "$release/VERSION")"
