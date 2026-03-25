#!/bin/bash

set -e

R='\033[0m'
DIM='\033[2m'
BCYAN='\033[1;36m'
BGREEN='\033[1;32m'
BRED='\033[1;31m'
BYELLOW='\033[1;33m'
BWHITE='\033[1;97m'
CYAN='\033[36m'
SILVER='\033[37m'

ts()   { date '+%Y-%m-%d %H:%M:%S.%3N'; }
log()  { printf "${DIM}$(ts)${R}  ${BCYAN}INFO ${R}  $*\n"; }
ok()   { printf "${DIM}$(ts)${R}  ${BCYAN}INFO ${R}  $*\n"; }
warn() { printf "${DIM}$(ts)${R}  ${BYELLOW}WARN ${R}  $*\n" >&2; }
err()  { printf "${DIM}$(ts)${R}  ${BRED}ERROR${R}  $*\n" >&2; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
NAMBI_DIR="$HOME/.nambi"
ENC_FILE="$NAMBI_DIR/.env.enc"
PASS_FILE="$NAMBI_DIR/.passphrase"
PID_FILE="$NAMBI_DIR/nambibot.pid"
LOG_FILE="$NAMBI_DIR/nambibot.log"
CRYPTO_SCRIPT="$ROOT_DIR/tools/env-crypto.js"

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

if [ ! -s "$ENC_FILE" ]; then
  warn "설정 파일 없음 — 초기 설정을 시작합니다"
  NAMBI_DIR="$NAMBI_DIR" bash tools/setup-env.sh
  if [ ! -s "$ENC_FILE" ]; then
    err "설정 파일 생성에 실패했습니다."
    exit 1
  fi
fi

if [ -z "$NAMBI_PASSPHRASE" ] && [ -f "$PASS_FILE" ] && [ -s "$PASS_FILE" ]; then
  NAMBI_PASSPHRASE=$(cat "$PASS_FILE")
  log "패스프레이즈: ${SILVER}${PASS_FILE}${R}"
elif [ -n "$NAMBI_PASSPHRASE" ]; then
  log "패스프레이즈: ${SILVER}환경변수 NAMBI_PASSPHRASE${R}"
else
  printf "  ${BCYAN}?${R}  패스프레이즈를 입력하세요  ${SILVER}›${R} "
  read -r -s NAMBI_PASSPHRASE
  echo ""
  if [ -z "$NAMBI_PASSPHRASE" ]; then
    err "패스프레이즈가 비어 있습니다."
    exit 1
  fi
fi

DECRYPTED=$(NAMBI_PASSPHRASE="$NAMBI_PASSPHRASE" node "$CRYPTO_SCRIPT" decrypt < "$ENC_FILE" 2>/dev/null) || {
  err "복호화 실패: 잘못된 패스프레이즈이거나 파일이 손상되었습니다."
  exit 1
}
ok "설정 파일 복호화 완료"

WEB_PORT=$(echo "$DECRYPTED" | grep '^WEB_PORT=' | cut -d= -f2 | tr -d ' ')
WEB_PORT=${WEB_PORT:-3000}
WEB_UI_URL=$(echo "$DECRYPTED" | grep '^WEB_UI_URL=' | sed 's/^[^=]*=//')
WEB_UI_URL=${WEB_UI_URL:-"http://localhost:${WEB_PORT}"}

REQUIRED_KEYS="DISCORD_TOKEN APPLICATION_ID GUILD_ID"
invalid=""
for key in $REQUIRED_KEYS; do
  value=$(echo "$DECRYPTED" | grep "^${key}=" | sed 's/^[^=]*=//')
  [ -z "$value" ] && invalid="${invalid}\n    ${BRED}✗${R}  $key"
done

if [ -n "$invalid" ]; then
  err "아래 필수 환경변수가 설정되지 않았습니다."
  printf "$invalid\n" >&2
  err "설정 파일을 확인해주세요: ${SILVER}$ENC_FILE"
  exit 1
fi
ok "환경변수 검증 완료  ${SILVER}WEB_PORT=${WEB_PORT}${R}"

_YTDLP_BIN=$(echo "$DECRYPTED" | grep '^YT_DLP_BIN=' | cut -d= -f2 | tr -d ' ')
_YTDLP_BIN=${_YTDLP_BIN:-yt-dlp}
_FFMPEG_BIN=$(echo "$DECRYPTED" | grep '^FFMPEG_BIN=' | cut -d= -f2 | tr -d ' ')
_FFMPEG_BIN=${_FFMPEG_BIN:-ffmpeg}

if ! command -v node > /dev/null 2>&1; then
  err "Node.js를 찾을 수 없습니다."
  echo ""
  printf "${BRED}  ╭─────────────────────────────────────────────╮${R}\n"
  printf "${BRED}  │${R}  Node.js 20+ 설치가 필요합니다.             ${BRED}│${R}\n"
  printf "${BRED}  │${R}                                             ${BRED}│${R}\n"
  printf "${BRED}  │${R}  ${SILVER}Ubuntu / Debian:${R}                           ${BRED}│${R}\n"
  printf "${BRED}  │${R}  ${DIM}curl -fsSL https://deb.nodesource.com/${R}     ${BRED}│${R}\n"
  printf "${BRED}  │${R}  ${DIM}setup_20.x | sudo -E bash -${R}                ${BRED}│${R}\n"
  printf "${BRED}  │${R}  ${DIM}sudo apt install -y nodejs${R}                 ${BRED}│${R}\n"
  printf "${BRED}  ╰─────────────────────────────────────────────╯${R}\n"
  echo ""
  exit 1
fi

_missing_bins=""
command -v "$_FFMPEG_BIN" > /dev/null 2>&1 || _missing_bins="${_missing_bins} ffmpeg"
command -v "$_YTDLP_BIN"  > /dev/null 2>&1 || _missing_bins="${_missing_bins} yt-dlp"

if [ -n "$_missing_bins" ]; then
  for _b in $_missing_bins; do
    err "바이너리를 찾을 수 없습니다: ${CYAN}${_b}${R}"
  done
  echo ""
  printf "${BRED}  ╭─────────────────────────────────────────────╮${R}\n"
  printf "${BRED}  │${R}  음악 재생에 필요한 패키지가 없습니다.      ${BRED}│${R}\n"
  printf "${BRED}  │${R}                                             ${BRED}│${R}\n"
  printf "${BRED}  │${R}  ${SILVER}ffmpeg${R} 설치:                               ${BRED}│${R}\n"
  printf "${BRED}  │${R}  ${DIM}sudo apt install -y ffmpeg${R}                 ${BRED}│${R}\n"
  printf "${BRED}  │${R}                                             ${BRED}│${R}\n"
  printf "${BRED}  │${R}  ${SILVER}yt-dlp${R} 설치:                               ${BRED}│${R}\n"
  printf "${BRED}  │${R}  ${DIM}sudo curl -L https://github.com/yt-dlp/${R}    ${BRED}│${R}\n"
  printf "${BRED}  │${R}  ${DIM}yt-dlp/releases/latest/download/yt-dlp${R}     ${BRED}│${R}\n"
  printf "${BRED}  │${R}  ${DIM}-o /usr/local/bin/yt-dlp${R}                   ${BRED}│${R}\n"
  printf "${BRED}  │${R}  ${DIM}sudo chmod +x /usr/local/bin/yt-dlp${R}        ${BRED}│${R}\n"
  printf "${BRED}  ╰─────────────────────────────────────────────╯${R}\n"
  echo ""
  exit 1
fi
ok "시스템 바이너리 확인 완료  ${SILVER}node=$(node --version)  yt-dlp=$(${_YTDLP_BIN} --version 2>/dev/null | head -1)  ffmpeg=$(${_FFMPEG_BIN} -version 2>/dev/null | head -1 | awk '{print $3}')${R}"

if python3 -c "import yt_dlp_ejs" 2>/dev/null; then
  ok "yt-dlp-ejs 설치 확인됨"
else
  warn "yt-dlp-ejs 미설치 — YouTube JS 서명 처리 불가, 일부 영상 재생 실패 가능"
  warn "설치 명령: pip3 install yt-dlp-ejs"
fi

_ytdlp_cur=$(${_YTDLP_BIN} --version 2>/dev/null | tr -d '[:space:]')
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

if [ ! -d node_modules ]; then
  log "패키지 설치 중..."
  npm install --silent
  ok "패키지 설치 완료"
fi

if [ ! -f "$NAMBI_DIR/.commands-deployed" ]; then
  log "슬래시 명령어 등록 중..."
  set +e
  env $(echo "$DECRYPTED" | grep -v '^#' | grep -v '^$' | xargs) node tools/deploy-commands.js
  DEPLOY_EXIT=$?
  set -e
  if [ "$DEPLOY_EXIT" -eq 0 ]; then
    ok "슬래시 명령어 등록 완료"
    touch "$NAMBI_DIR/.commands-deployed"
  elif [ "$DEPLOY_EXIT" -eq 2 ]; then
    err "Discord 설정값이 올바르지 않습니다 — 설정 파일을 초기화합니다"
    rm -f "$NAMBI_DIR/.env.enc" "$NAMBI_DIR/.passphrase"
    ok "초기화 완료. 다음 실행 시 setup-env 설정이 자동으로 시작됩니다"
    printf "${DIM}--- ─────────────────────────────────────── ---${R}\n"
    err "봇 기동이 중단되었습니다."
    echo ""
    printf "${BYELLOW}  ╭─────────────────────────────────────────────╮${R}\n"
    printf "${BYELLOW}  │${R}  Discord 설정값이 올바르지 않습니다.        ${BYELLOW}│${R}\n"
    printf "${BYELLOW}  │${R}  설정 파일이 초기화되었습니다.              ${BYELLOW}│${R}\n"
    printf "${BYELLOW}  │${R}                                             ${BYELLOW}│${R}\n"
    printf "${BYELLOW}  │${R}  다시 실행하면 설정을 새로 입력합니다.      ${BYELLOW}│${R}\n"
    printf "${BYELLOW}  │${R}  ${DIM}./scripts/baremetal-run.sh${R}                ${BYELLOW}│${R}\n"
    printf "${BYELLOW}  ╰─────────────────────────────────────────────╯${R}\n"
    echo ""
    exit 1
  else
    err "슬래시 명령어 등록 실패 (exit ${DEPLOY_EXIT})"
    printf "${DIM}--- ─────────────────────────────────────── ---${R}\n"
    err "봇 기동이 중단되었습니다."
    echo ""
    printf "${BRED}  ╭─────────────────────────────────────────────╮${R}\n"
    printf "${BRED}  │${R}  슬래시 명령어 등록에 실패했습니다.         ${BRED}│${R}\n"
    printf "${BRED}  │${R}  Discord 설정값을 확인해주세요.             ${BRED}│${R}\n"
    printf "${BRED}  │${R}                                             ${BRED}│${R}\n"
    printf "${BRED}  │${R}  설정을 다시 입력하려면:                    ${BRED}│${R}\n"
    printf "${BRED}  │${R}  ${DIM}./scripts/reconfigure.sh${R}                  ${BRED}│${R}\n"
    printf "${BRED}  ╰─────────────────────────────────────────────╯${R}\n"
    echo ""
    exit 1
  fi
fi

_listen="http://localhost:${WEB_PORT}"

_stop_pid() {
  local pid="$1"
  kill "$pid" 2>/dev/null || return 0
  for _ in $(seq 1 10); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.5
  done
  kill -9 "$pid" 2>/dev/null || true
}

if [ -f "$PID_FILE" ] && [ -s "$PID_FILE" ]; then
  _old_pid=$(cat "$PID_FILE")
  if kill -0 "$_old_pid" 2>/dev/null; then
    log "기존 프로세스 종료 중...  ${SILVER}PID=${_old_pid}${R}"
    _stop_pid "$_old_pid"
    ok "기존 프로세스 종료 완료"
  fi
  rm -f "$PID_FILE"
fi

if ss -tlnp 2>/dev/null | awk '{print $4}' | grep -q ":${WEB_PORT}$" || \
   netstat -tlnp 2>/dev/null | awk '{print $4}' | grep -q ":${WEB_PORT}$"; then
  echo ""
  err "포트 ${CYAN}${WEB_PORT}${R}가 이미 다른 프로세스에서 사용 중입니다."
  echo ""
  _pp=$(printf '%*s' $((23 - ${#WEB_PORT})) '')
  printf "${BRED}  ╭─────────────────────────────────────────────╮${R}\n"
  printf "${BRED}  │${R}  포트 충돌로 시작할 수 없습니다.            ${BRED}│${R}\n"
  printf "${BRED}  │${R}                                             ${BRED}│${R}\n"
  printf "${BRED}  │${R}  ${SILVER}1.${R} 해당 포트의 프로세스를 종료하세요.      ${BRED}│${R}\n"
  printf "${BRED}  │${R}     ${DIM}ss -tlnp | grep :${WEB_PORT}${R}${_pp}${BRED}│${R}\n"
  printf "${BRED}  │${R}                                             ${BRED}│${R}\n"
  printf "${BRED}  │${R}  ${SILVER}2.${R} 설정에서 다른 포트를 지정하세요.        ${BRED}│${R}\n"
  printf "${BRED}  │${R}     ${DIM}./scripts/reconfigure.sh${R}               ${BRED}│${R}\n"
  printf "${BRED}  ╰─────────────────────────────────────────────╯${R}\n"
  echo ""
  exit 1
fi

log "봇 시작 중..."
setsid env $(echo "$DECRYPTED" | grep -v '^#' | grep -v '^$' | xargs) \
  NAMBI_DIR="$NAMBI_DIR" \
  node index.js >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
_pid=$(cat "$PID_FILE")
ok "봇 시작 완료  ${SILVER}PID=${_pid}${R}"

echo ""
_w1=$((8 + ${#WEB_UI_URL}))
_w2=$((8 + ${#_listen}))
_inner=$(( _w1 > _w2 ? _w1 : _w2 ))
[ "$_inner" -lt 40 ] && _inner=40
_border=$(printf '─%.0s' $(seq 1 $((_inner + 4))))
if [ "$WEB_UI_URL" != "$_listen" ]; then
  _p1=$(printf '%*s' $((_inner - _w1)) '')
  _p2=$(printf '%*s' $((_inner - _w2)) '')
  printf "${BGREEN}  ╭${_border}╮${R}\n"
  printf "${BGREEN}  │${R}  ${BCYAN}Web UI${R}  ${BWHITE}${WEB_UI_URL}${R}${_p1}  ${BGREEN}│${R}\n"
  printf "${BGREEN}  │${R}  ${DIM}Listen  ${_listen}${R}${_p2}  ${BGREEN}│${R}\n"
  printf "${BGREEN}  ╰${_border}╯${R}\n"
else
  _p1=$(printf '%*s' $((_inner - _w1)) '')
  printf "${BGREEN}  ╭${_border}╮${R}\n"
  printf "${BGREEN}  │${R}  ${BCYAN}Web UI${R}  ${BWHITE}${_listen}${R}${_p1}  ${BGREEN}│${R}\n"
  printf "${BGREEN}  ╰${_border}╯${R}\n"
fi
echo ""
sleep 1
printf "${BCYAN}  로그를 출력합니다.${R}  ${BYELLOW}Ctrl+C${R}${SILVER}로 로그 보기만 종료됩니다.${R}\n"
printf "${DIM}--- ─────────────────────────────────────── ---${R}\n"
{ sleep 4 && printf "\n${BYELLOW}  ↑ Ctrl+C${R}${SILVER}로 로그 보기 종료 (봇은 계속 실행됩니다)${R}\n${DIM}--- ─────────────────────────────────────── ---${R}\n"; } &
HINT_PID=$!
NAMBI_LOG="$LOG_FILE" python3 -c "
import os, subprocess, signal
try:
    import termios
    fd = os.open('/dev/tty', os.O_RDWR)
    a = termios.tcgetattr(fd)
    a[3] |= termios.ISIG
    termios.tcsetattr(fd, termios.TCSANOW, a)
    os.close(fd)
except: pass
f = os.environ['NAMBI_LOG']
p = subprocess.Popen(['tail', '-f', '-n', '0', f], preexec_fn=os.setsid)
def h(s,f):
    try: p.kill()
    except: pass
    os._exit(0)
signal.signal(signal.SIGINT, h)
try: p.wait()
except KeyboardInterrupt:
    try: p.kill()
    except: pass
" || tail -f -n 0 "$LOG_FILE" 2>&1 || true
kill $HINT_PID 2>/dev/null || true; wait $HINT_PID 2>/dev/null || true
printf "${DIM}--- ─────────────────────────────────────── ---${R}\n"
if kill -0 "$_pid" 2>/dev/null; then
  ok "로그 보기 종료. 봇은 계속 실행 중입니다."
else
  err "봇이 종료되었습니다. 로그를 확인하세요:"
  printf "  ${SILVER}tail -n 50 ${LOG_FILE}${R}\n"
fi
echo ""
