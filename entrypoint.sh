#!/usr/bin/env bash
# 其他Paas保活
PAAS1=
PAAS2=
PAAS3=

# koyeb账号保活
KOYEB_ACCOUNT=
KOYEB_PASSWORD=

# Argo 固定域名隧道的两个参数,这个可以填 Json 内容或 Token 内容，获取方式看 https://github.com/fscarmen2/X-for-Glitch，不需要的话可以留空，删除或在这三行最前面加 # 以注释
ARGO_AUTH={"AccountTag":"14fb180ade4ca865b694b9753897adb4","TunnelSecret":"qAw4PaPkQaoYMbWOVaI9mE3xbYJt56TyMR/CflNdNNU=","TunnelID":"a8813a8b-f5e8-4eba-88a1-ffe52f07924e"}
ARGO_DOMAIN=appbcak.2tiejhho34.gq

generate_argo() {
  cat > argo.sh << ABC
#!/usr/bin/env bash

ARGO_AUTH=${ARGO_AUTH}
ARGO_DOMAIN=${ARGO_DOMAIN}

# 下载并运行 Argo
check_file() {
  [ ! -e cloudflared ] && wget -O cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x cloudflared
}

run() {
  if [[ -n "\${ARGO_AUTH}" && -n "\${ARGO_DOMAIN}" ]]; then
    [[ "\$ARGO_AUTH" =~ TunnelSecret ]] && echo "\$ARGO_AUTH" | sed 's@{@{"@g;s@[,:]@"\0"@g;s@}@"}@g' > tunnel.json && echo -e "tunnel: \$(sed "s@.*TunnelID:\(.*\)}@\1@g" <<< "\$ARGO_AUTH")\ncredentials-file: /app/tunnel.json" > tunnel.yml && ./cloudflared tunnel --edge-ip-version auto --config tunnel.yml --url http://localhost:8080 run 2>&1 &
    [[ \$ARGO_AUTH =~ ^[A-Z0-9a-z=]{120,250}$ ]] && ./cloudflared tunnel --edge-ip-version auto run --token ${ARGO_AUTH} 2>&1 &
  else
    ./cloudflared tunnel --edge-ip-version auto --no-autoupdate --logfile argo.log --loglevel info --url http://localhost:8080 2>&1 &
    sleep 5
    ARGO_DOMAIN=\$(cat argo.log | grep -o "info.*https://.*trycloudflare.com" | sed "s@.*https://@@g" | tail -n 1)
  fi
}

check_file
run
ABC
}

# Paas保活
generate_keeplive() {
  cat > paaslive.sh << EOF
#!/usr/bin/env bash

# 传参
PAAS1=${PAAS1}
PAAS2=${PAAS2}
PAAS3=${PAAS3}

# 判断变量并保活
if [ -n "\${PAAS1}" ] && [ -n "\${PAAS2}" ] && [ -n "\${PAAS3}" ]; then
  while true; do
    curl \${PAAS1}
    curl \${PAAS2}
    curl \${PAAS3}
    rm -rf /dev/null
    sleep 240
  done
elif [ -n "\${PAAS1}" ] && [ -n "\${PAAS2}" ]; then
  while true; do
    curl \${PAAS1}
    curl \${PAAS2}
    rm -rf /dev/null
    sleep 240
  done
elif [ -n "\${PAAS1}" ]; then
  while true; do
    curl \${PAAS1}
    rm -rf /dev/null
    sleep 240
  done
else
  exit 1
fi
EOF
}

# koyeb保活
generate_koyeb() {
  cat > koyeb.sh << EOF
#!/usr/bin/env bash

# 传参
KOYEB_ACCOUNT=${KOYEB_ACCOUNT}
KOYEB_PASSWORD=${KOYEB_PASSWORD}

# 两个变量不全则不运行保活
check_variable() {
  [[ -z "\${KOYEB_ACCOUNT}" || -z "\${KOYEB_ACCOUNT}" ]] && exit
}

# 开始保活
run() {
while true
do
  curl -sX POST https://app.koyeb.com/v1/account/login -H 'Content-Type: application/json' -d '{"email":"'"\${KOYEB_ACCOUNT}"'","password":"'"\${KOYEB_PASSWORD}"'"}'
  rm -rf /dev/null
  sleep $((60*60*24*5))
done
}
check_variable
run
EOF
}

generate_pm2_file() {
    cat > ecosystem.config.js << EOF
module.exports = {
  "apps":[
      {
          "name":"web",
          "script":"/app/hi run"
      }
  ]
}
EOF
}

generate_argo
generate_keeplive
generate_koyeb
generate_pm2_file
[ -e argo.sh ] && bash argo.sh
[ -e paaslive.sh ] && nohup bash paaslive.sh >/dev/null 2>&1 &
[ -e koyeb.sh ] && nohup bash koyeb.sh >/dev/null 2>&1 &
[ -e ecosystem.config.js ] && pm2 start
