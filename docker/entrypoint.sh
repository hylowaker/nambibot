#!/bin/bash
set -e

# ── 색상 ──────────────────────────────────────────────────
R='\033[0m'
DIM='\033[90m'
BCYAN='\033[1;36m'
BGREEN='\033[1;32m'
BYELLOW='\033[1;33m'
BRED='\033[1;31m'
CYAN='\033[36m'
SILVER='\033[37m'

ts() { date '+%Y-%m-%d %H:%M:%S.%3N'; }
log()  { printf "${DIM}$(ts)${R}  ${BCYAN}INFO ${R}  $*\n"; }
ok()   { printf "${DIM}$(ts)${R}  ${BCYAN}INFO ${R}  $*\n"; }
warn() { printf "${DIM}$(ts)${R}  ${BYELLOW}WARN ${R}  $*\n" >&2; }
err()  { printf "${DIM}$(ts)${R}  ${BRED}ERROR${R}  $*\n" >&2; }

cd /app

# ── 로고 ──────────────────────────────────────────────────
_ver=$(grep '"version"' /app/package.json 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
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

log "컨테이너 시작  ${SILVER}PID=$$  빌드: $(cat /app/.image-tag 2>/dev/null || echo '알 수 없음')${R}"
log "OS: ${SILVER}$(uname -sr)  아키텍처: $(uname -m)${R}"
log "Node.js: ${SILVER}$(node --version)  npm: $(npm --version 2>/dev/null || echo '알 수 없음')${R}"

export NAMBI_DIR="${NAMBI_DIR:-$HOME/.nambi}"
ENC_FILE="$NAMBI_DIR/.env.enc"

log "데이터 디렉토리: ${SILVER}${NAMBI_DIR}${R}"
mkdir -p "$NAMBI_DIR"

# ── 설정 파일 로드 ────────────────────────────────────────
if [ ! -f "$ENC_FILE" ] || [ ! -s "$ENC_FILE" ]; then
  warn "설정 파일 없음 — 대화형 설정 시작"
  NAMBI_DIR="$NAMBI_DIR" bash scripts/setup-env.sh

  if [ ! -f "$ENC_FILE" ] || [ ! -s "$ENC_FILE" ]; then
    err "설정 파일 생성에 실패했습니다."
    exit 1
  fi
fi

# 암호화된 .env.enc 복호화
log "설정 파일 복호화 중: ${SILVER}${ENC_FILE}${R}"
PASS_FILE="$NAMBI_DIR/.passphrase"
if [ -z "$NAMBI_PASSPHRASE" ] && [ -f "$PASS_FILE" ] && [ -s "$PASS_FILE" ]; then
  NAMBI_PASSPHRASE=$(cat "$PASS_FILE")
  log "패스프레이즈: ${SILVER}${PASS_FILE}${R}"
elif [ -z "$NAMBI_PASSPHRASE" ]; then
  err "NAMBI_PASSPHRASE 환경변수가 설정되지 않았습니다."
  err "scripts/setup-env.sh 실행 시 생성된 ${PASS_FILE} 파일이 있는지 확인하거나,"
  err "docker run -e NAMBI_PASSPHRASE='...' 형식으로 직접 전달해주세요."
  exit 1
fi

DECRYPTED=$(NAMBI_PASSPHRASE="$NAMBI_PASSPHRASE" node /app/scripts/env-crypto.js decrypt < "$ENC_FILE" 2>/dev/null) || {
  err "복호화 실패: 잘못된 패스프레이즈이거나 파일이 손상되었습니다."
  exit 1
}
export $(echo "$DECRYPTED" | grep -v '^#' | grep -v '^$' | xargs)
ok "복호화 완료"

# 필수 환경변수 검증
REQUIRED_KEYS="DISCORD_TOKEN APPLICATION_ID GUILD_ID"
invalid=""
for key in $REQUIRED_KEYS; do
  eval value=\$$key
  [ -z "$value" ] && invalid="$invalid\n    ${BRED}✗${R}  $key"
done

if [ -n "$invalid" ]; then
  err "아래 필수 환경변수가 설정되지 않았습니다."
  printf "$invalid\n" >&2
  err "설정 파일을 확인해주세요."
  exit 1
fi

ok "환경변수 검증 완료  ${SILVER}WEB_PORT=${WEB_PORT:-3000}${R}"

# 슬래시 명령어 등록
log "슬래시 명령어 등록 중..."
set +e
node scripts/deploy-commands.js
DEPLOY_EXIT=$?
set -e
if [ "$DEPLOY_EXIT" -eq 0 ]; then
  ok "슬래시 명령어 등록 완료"
elif [ "$DEPLOY_EXIT" -eq 2 ]; then
  err "Discord 설정값이 올바르지 않습니다 — 설정 파일을 초기화합니다"
  rm -f "$NAMBI_DIR/.env.enc" "$NAMBI_DIR/.passphrase"
  ok "초기화 완료. 다음 배포 시 setup-env 설정이 자동으로 시작됩니다"
  exit 0
else
  err "슬래시 커맨드 등록 실패 — 설정을 확인하고 다시 배포해주세요"
  exit 1
fi

echo ""
ok "봇 시작"
printf "${SILVER}  $(printf '─%.0s' $(seq 1 44))${R}\n"
echo ""
exec node index.js
