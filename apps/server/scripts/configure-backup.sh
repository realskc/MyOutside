#!/usr/bin/env bash
# 在服务器上以 root 运行；秘密只在本机输入，不出现在命令行或聊天里。
set -euo pipefail
install -d -m 0700 /etc/myoutside
read -r -p 'R2 endpoint（例如 https://<account>.r2.cloudflarestorage.com）: ' endpoint
read -r -p 'R2 bucket 名称: ' bucket
read -r -p 'R2 Access Key ID: ' access
read -r -s -p 'R2 Secret Access Key: ' secret; echo
read -r -s -p '随机生成的 32 字节备份钥匙（base64）: ' backup_key; echo
printf '%s' "$backup_key" | base64 -d >/dev/null
[ "$(printf '%s' "$backup_key" | base64 -d | wc -c)" -eq 32 ]
cat > /etc/myoutside/backup.env <<EOF
R2_ENDPOINT=$endpoint
R2_BUCKET=$bucket
AWS_ACCESS_KEY_ID=$access
AWS_SECRET_ACCESS_KEY=$secret
AWS_DEFAULT_REGION=auto
EOF
printf '%s\n' "$backup_key" > /etc/myoutside/backup.key
chmod 600 /etc/myoutside/backup.env /etc/myoutside/backup.key
echo 'R2 配置已保存；请把备份钥匙另存进密码管理器：'
echo "$backup_key"
