#!/bin/bash
set -e

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

_ver=$(grep '"version"' /app/package.json 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
_sub="Discord Music Bot  v${_ver}"
_pad=$(printf '%*s' $((68 - ${#_sub})) '')
echo ""
printf "${BCYAN}  ███╗   ██╗ █████╗ ███╗   ███╗██████╗ ██╗██████╗  ██████╗ ████████╗${R}\n"
printf "${BCYAN}  ████╗  ██║██╔══██╗████╗ ████║██╔══██╗██║██╔══██╗██╔═══██╗╚══██╔══╝${R}\n"
printf "${BCYAN}  ██╔██╗ ██║███████║██╔████╔██║██████╔╝██║██████╔╝██║   ██║   ██║   ${R}\n"
printf "${BCYAN}  ██║╚██╗██║██╔══██║██║╚██╔╝██║██╔══██╗██║██╔══██╗██║   ██║   ██║   ${R}\n"
printf "${BCYAN}  ██║ ╚████║██║  ██║██║ ╚═╝ ██║██████╔╝██║██████╔╝╚██████╔╝   ██║   ${R}\n"
printf "${BCYAN}  ╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝     ╚═╝╚═════╝ ╚═╝╚═════╝  ╚═════╝    ╚═╝   ${R}\n"
printf "${_pad}${DIM}${_sub}${R}\n"
echo ""

log "컨테이너 시작  ${SILVER}PID=$$  빌드: $(cat /app/.image-tag 2>/dev/null || echo '알 수 없음')${R}"
log "OS: ${SILVER}$(uname -sr)  아키텍처: $(uname -m)${R}"
log "Node.js: ${SILVER}$(node --version)  npm: $(npm --version 2>/dev/null || echo '알 수 없음')${R}"

export NAMBI_DIR="${NAMBI_DIR:-$HOME/.nambi}"
ENC_FILE="$NAMBI_DIR/.env.enc"

log "데이터 디렉토리: ${SILVER}${NAMBI_DIR}${R}"
mkdir -p "$NAMBI_DIR"

if [ ! -f "$ENC_FILE" ] || [ ! -s "$ENC_FILE" ]; then
  warn "설정 파일 없음 — 대화형 설정 시작"
  NAMBI_DIR="$NAMBI_DIR" bash tools/setup-env.sh

  if [ ! -f "$ENC_FILE" ] || [ ! -s "$ENC_FILE" ]; then
    err "설정 파일 생성에 실패했습니다."
    exit 1
  fi
fi

log "설정 파일 복호화 중: ${SILVER}${ENC_FILE}${R}"
PASS_FILE="$NAMBI_DIR/.passphrase"
if [ -z "$NAMBI_PASSPHRASE" ] && [ -f "$PASS_FILE" ] && [ -s "$PASS_FILE" ]; then
  NAMBI_PASSPHRASE=$(cat "$PASS_FILE")
  log "패스프레이즈: ${SILVER}${PASS_FILE}${R}"
elif [ -z "$NAMBI_PASSPHRASE" ]; then
  err "NAMBI_PASSPHRASE 환경변수가 설정되지 않았습니다."
  err "tools/setup-env.sh 실행 시 생성된 ${PASS_FILE} 파일이 있는지 확인하거나,"
  err "docker run -e NAMBI_PASSPHRASE='...' 형식으로 직접 전달해주세요."
  exit 1
fi

DECRYPTED=$(NAMBI_PASSPHRASE="$NAMBI_PASSPHRASE" node /app/tools/env-crypto.js decrypt < "$ENC_FILE" 2>/dev/null) || {
  err "복호화 실패: 잘못된 패스프레이즈이거나 파일이 손상되었습니다."
  exit 1
}
export $(echo "$DECRYPTED" | grep -v '^#' | grep -v '^$' | xargs)
ok "복호화 완료"

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

log "슬래시 명령어 등록 중..."
set +e
node tools/deploy-commands.js
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

if python3 -c "import yt_dlp_ejs" 2>/dev/null; then
  ok "yt-dlp-ejs 설치 확인됨"
else
  warn "yt-dlp-ejs 미설치 — YouTube JS 서명 처리 불가, 일부 영상 재생 실패 가능"
  warn "설치 명령: pip3 install yt-dlp-ejs"
fi

_ytdlp_cur=$(yt-dlp --version 2>/dev/null | tr -d '[:space:]')
_ytdlp_latest=""
if command -v curl > /dev/null 2>&1; then
  _ytdlp_latest=$(curl -s --connect-timeout 3 --max-time 4 \
    -H "User-Agent: nambibot" \
    "https://api.github.com/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest" \
    2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tag_name',''))" 2>/dev/null | tr -d '[:space:]')
fi
if [ -z "$_ytdlp_latest" ]; then
  warn "yt-dlp 최신 nightly 버전 확인 실패 (네트워크 오류) — 건너뜁니다."
elif [ "$_ytdlp_cur" = "$_ytdlp_latest" ]; then
  ok "yt-dlp 최신 nightly 버전 확인됨  ${SILVER}${_ytdlp_cur}${R}"
else
  warn "yt-dlp 업데이트 필요  현재: ${_ytdlp_cur}  →  최신 nightly: ${_ytdlp_latest}"
  warn "오래된 버전은 일부 사이트에서 다운로드 오류를 유발할 수 있습니다."
  warn "업데이트 명령: yt-dlp -U --update-to nightly"
fi

echo ""
ok "봇 시작"
printf "${SILVER}  $(printf '─%.0s' $(seq 1 44))${R}\n"
echo ""
exec node index.js
