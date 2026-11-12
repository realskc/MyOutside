#!/usr/bin/env bash
# 配置 R2 备份并做第一次备份（D-0092、D-0096）。作者自己 ssh 上服务器后运行：
#   sudo /opt/myoutside/current/apps/server/scripts/configure-backup.sh             第一次配置；以后换 R2 令牌也用它（已有的备份钥匙保留）
#   sudo /opt/myoutside/current/apps/server/scripts/configure-backup.sh --new-key   换一把新的备份钥匙（旧备份要用旧钥匙解）
# 秘密只在这里输入、不显示，不出现在命令行、终端历史或聊天里（AGENTS.md 红线 3）。
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "要用 sudo 运行"; exit 1; }
umask 077
dir=/etc/myoutside
env_file="$dir/backup.env"
key_file="$dir/backup.key"
install -d -m 0700 "$dir"

echo "== R2 的连接信息（Cloudflare 后台建令牌时给的） =="
read -r -p 'S3 API 地址（https://<账号 id>.r2.cloudflarestorage.com，带不带桶名都行）: ' url
url="${url%/}"
if [[ ! "$url" =~ ^(https://[0-9a-f]{32}\.([a-z]+\.)?r2\.cloudflarestorage\.com)(/([a-z0-9-]+))?$ ]]; then
  echo "地址格式不对：应当形如 https://<32 位账号 id>.r2.cloudflarestorage.com"
  exit 1
fi
endpoint="${BASH_REMATCH[1]}"
default_bucket="${BASH_REMATCH[4]:-myoutside-backup}"
read -r -p "桶的名字 [$default_bucket]: " bucket
bucket="${bucket:-$default_bucket}"
[[ "$bucket" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]] || { echo "桶名格式不对"; exit 1; }
read -r -p 'Access Key ID: ' access
[[ "$access" =~ ^[0-9a-f]{32}$ ]] || { echo "Access Key ID 应当是 32 位十六进制"; exit 1; }
read -r -s -p 'Secret Access Key（粘贴后不显示）: ' secret
echo
[[ "$secret" =~ ^[0-9a-f]{64}$ ]] || { echo "Secret Access Key 应当是 64 位十六进制"; exit 1; }

echo
echo "== 备份钥匙（加密备份用；Cloudflare 看不到内容） =="
if [ -s "$key_file" ] && [ "${1:-}" != "--new-key" ]; then
  echo "保留已有的备份钥匙（$key_file）。"
else
  read -r -s -p '在新服务器上恢复时，粘贴原来的备份钥匙；第一次配置直接按回车，生成一把新的: ' backup_key
  echo
  if [ -z "$backup_key" ]; then
    backup_key="$(head -c 32 /dev/urandom | base64)"
    while true; do
      echo
      echo "新的备份钥匙（只在这里显示）："
      echo
      echo "    $backup_key"
      echo
      echo "把它存进密码管理器：服务器整个没了的时候，只能靠这一份解开备份。"
      read -r -p '存好以后按回车（会清屏）' _
      printf '\033[2J\033[3J\033[H'
      read -r -s -p '从密码管理器里复制出来，粘贴回这里核对（不显示）: ' again
      echo
      [ "$again" = "$backup_key" ] && { echo "核对通过：密码管理器里存的是对的。"; break; }
      echo "和生成的不一样，再显示一次。"
    done
  fi
  [ "$(printf '%s' "$backup_key" | base64 -d 2>/dev/null | wc -c)" -eq 32 ] || { echo "钥匙不对：应当是 base64 编码的 32 字节"; exit 1; }
  printf '%s\n' "$backup_key" > "$key_file"
fi

cat > "$env_file" <<EOF
R2_ENDPOINT=$endpoint
R2_BUCKET=$bucket
AWS_ACCESS_KEY_ID=$access
AWS_SECRET_ACCESS_KEY=$secret
AWS_DEFAULT_REGION=auto
EOF
chmod 600 "$env_file" "$key_file"
echo "已保存（只有 root 能读）：$env_file、$key_file"

echo
echo "== 第一次备份 =="
systemctl daemon-reload
systemctl enable --now myoutside-backup.timer >/dev/null
if systemctl start myoutside-backup.service; then
  journalctl -u myoutside-backup.service -n 6 --no-pager -o cat
  echo "成功。以后每天凌晨 4 点（香港时间）自动备份，每次部署前也会备份。"
else
  journalctl -u myoutside-backup.service -n 20 --no-pager -o cat
  echo "第一次备份失败，看上面的报错；改好后重新运行这个脚本即可（备份钥匙会保留）。"
  exit 1
fi
