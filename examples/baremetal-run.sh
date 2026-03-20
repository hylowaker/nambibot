#!/bin/bash
# 호스트에서 nambibot을 백그라운드로 실행하는 스크립트
#
# 사용법:
#   ./examples/baremetal-run.sh
#
# 설정 파일은 ~/.nambi/ 에 저장됩니다.
# 로그는 ~/.nambi/nambibot.log 에 저장됩니다.

set -e

R='\033[0m'
DIM='\033[2m'
BCYAN='\033[1;36m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
NAMBI_DIR="$HOME/.nambi"
ENV_FILE="$NAMBI_DIR/.env"
PID_FILE="$NAMBI_DIR/nambibot.pid"
LOG_FILE="$NAMBI_DIR/nambibot.log"

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

# 이미 실행 중이면 종료
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "이미 실행 중입니다. (PID: $(cat "$PID_FILE"))"
  echo "중지하려면: kill $(cat "$PID_FILE")"
  exit 0
fi

# 백그라운드 실행
nohup env $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs) node index.js >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

echo "봇이 백그라운드에서 실행 중입니다. (PID: $(cat "$PID_FILE"))"
echo ""
echo "로그 확인:  tail -f $LOG_FILE"
echo "중지:       kill \$(cat $PID_FILE)"
