#!/bin/bash
# systemd 사용자 서비스로 nambibot을 등록하고 실행하는 스크립트
#
# 사용법:
#   ./examples/systemd-setup.sh
#
# 설정 파일은 ~/.nambi/ 에 저장됩니다.

set -e

R='\033[0m'
DIM='\033[2m'
BCYAN='\033[1;36m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
NAMBI_DIR="$HOME/.nambi"
ENV_FILE="$NAMBI_DIR/.env"
SERVICE_NAME="nambibot"
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/$SERVICE_NAME.service"

mkdir -p "$NAMBI_DIR"
cd "$ROOT_DIR"

_ver=$(grep '"version"' "$ROOT_DIR/package.json" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
_sub="Discord Music Bot  v${_ver}"
_pad=$(printf '%*s' $((68 - ${#_sub})) '')
echo ""
printf "${BCYAN}  ███╗   ██╗ █████╗ ███╗   ███╗██████╗ ██╗██████╗  ██████╗ ████████╗${R}\n"
printf "${BCYAN}  ████╗  ██║██╔══██╗████╗ ████║██╔══██╗██║██╔══██╗██╔═══██╗╚══██╔══╝${R}\n"
printf "${BCYAN}  ██╔██╗ ██║███████║██╔████╔██║██████╔╝██║██████╔╝██║   ██║   ██║   ${R}\n"
printf "${BCYAN}  ██║╚██╗██║██╔══██║██║╚██╔╝██║██╔══██╗██║██╔══██╗██║   ██║   ██║   ${R}\n"
printf "${BCYAN}  ██║ ╚████║██║  ██║██║ ╚═╝ ██║██████╔╝██║██████╔╝╚██████╔╝   ██║   ${R}\n"
printf "${BCYAN}  ╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝     ╚═╝╚═════╝ ╚═╝╚═════╝  ╚═════╝   ╚═╝   ${R}\n"
printf "${_pad}${DIM}${_sub}${R}\n"
echo ""

# .env 확인
if [ ! -s "$ENV_FILE" ]; then
  NAMBI_DIR="$NAMBI_DIR" bash scripts/setup-env.sh
fi

# 필수 환경변수 검증
REQUIRED_KEYS="DISCORD_TOKEN APPLICATION_ID GUILD_ID"
invalid=""
for key in $REQUIRED_KEYS; do
  value=$(grep "^${key}=" "$ENV_FILE" | sed 's/^[^=]*=//')
  if [ -z "$value" ]; then
    invalid="$invalid\n  - $key"
  fi
done

if [ -n "$invalid" ]; then
  echo "오류: 아래 필수 환경변수가 설정되지 않았습니다."
  printf "$invalid\n"
  echo ""
  echo "$ENV_FILE 파일을 확인해주세요."
  exit 1
fi

# 의존성 설치
if [ ! -d node_modules ]; then
  echo "패키지를 설치합니다..."
  npm install
fi

# 슬래시 명령어 등록 (최초 1회)
if [ ! -f "$NAMBI_DIR/.commands-deployed" ]; then
  echo "슬래시 명령어를 등록합니다..."
  env $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs) node scripts/deploy-commands.js
  touch "$NAMBI_DIR/.commands-deployed"
fi

# linger 활성화 (로그아웃 후에도 서비스 유지)
sudo loginctl enable-linger "$USER"

# 서비스 디렉토리 생성
mkdir -p "$SERVICE_DIR"

# .service 파일 생성
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=NambiBot Discord Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$(which node) $ROOT_DIR/index.js

Restart=on-failure
RestartSec=5s

SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=default.target
EOF

echo "서비스 파일이 생성되었습니다: $SERVICE_FILE"

# 서비스 등록 및 시작
systemctl --user daemon-reload
systemctl --user enable --now "$SERVICE_NAME"

echo ""
echo "봇이 systemd 서비스로 실행 중입니다."
echo ""
echo "로그 확인:  journalctl --user -u $SERVICE_NAME -f"
echo "상태 확인:  systemctl --user status $SERVICE_NAME"
echo "중지:       systemctl --user stop $SERVICE_NAME"
echo "재시작:     systemctl --user restart $SERVICE_NAME"
echo "서비스 제거: systemctl --user disable --now $SERVICE_NAME"
