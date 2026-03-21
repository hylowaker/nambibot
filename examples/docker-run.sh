#!/bin/bash
# Docker 컨테이너로 nambibot을 실행하는 스크립트
#
# 사용법:
#   ./examples/docker-run.sh          # 첫 실행 또는 재배포
#   ./examples/docker-run.sh --logs   # 이미 실행 중인 컨테이너 로그만 보기

set -e

# ── 색상 ──────────────────────────────────────────────────
R='\033[0m'
DIM='\033[2m'
BCYAN='\033[1;36m'
BGREEN='\033[1;32m'
BYELLOW='\033[1;33m'
BRED='\033[1;31m'
BWHITE='\033[1;97m'
CYAN='\033[36m'
SILVER='\033[37m'

ts() { date '+%Y-%m-%d %H:%M:%S.%3N'; }
log()  { printf "${DIM}$(ts)${R}  ${BCYAN}INFO ${R}  $*\n"; }
ok()   { printf "${DIM}$(ts)${R}  ${BCYAN}INFO ${R}  $*\n"; }
warn() { printf "${DIM}$(ts)${R}  ${BYELLOW}WARN ${R}  $*\n" >&2; }
err()  { printf "${DIM}$(ts)${R}  ${BRED}ERROR${R}  $*\n" >&2; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

IMAGE_NAME="nambibot"
CONTAINER_NAME="nambibot"
NAMBI_DIR="$HOME/.nambi"

# ── 로그만 보기 모드 ──────────────────────────────────────
if [ "${1}" = "--logs" ]; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    err "컨테이너가 실행 중이지 않습니다: ${CONTAINER_NAME}"
    exit 1
  fi
  printf "${SILVER}--- 로그 출력 중 (Ctrl+C로 로그 보기 종료) ---${R}\n"
  { sleep 2 && printf "\n${SILVER}  ↑ Ctrl+C로 로그 보기 종료 (봇은 계속 실행됩니다)${R}\n${SILVER}--- ────────────────────────────────────── ---${R}\n"; } &
  HINT_PID=$!
  NAMBI_CONTAINER="$CONTAINER_NAME" python3 -c "
import os, sys, subprocess, signal
try:
    import termios
    fd = os.open('/dev/tty', os.O_RDWR)
    a = termios.tcgetattr(fd)
    a[3] |= termios.ISIG
    termios.tcsetattr(fd, termios.TCSANOW, a)
    os.close(fd)
except: pass
c = os.environ['NAMBI_CONTAINER']
p = subprocess.Popen(['docker','logs','-f',c], preexec_fn=os.setsid)
def h(s,f):
    try: p.kill()
    except: pass
    os._exit(0)
signal.signal(signal.SIGINT, h)
try: p.wait()
except KeyboardInterrupt:
    try: p.kill()
    except: pass
" || docker logs -f "$CONTAINER_NAME" 2>&1 || true
  kill $HINT_PID 2>/dev/null || true; wait $HINT_PID 2>/dev/null || true
  printf "${SILVER}--- 로그 보기 종료. 봇은 계속 실행 중입니다. ---${R}\n"
  exit 0
fi

# ── 배포 ──────────────────────────────────────────────────
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

log "프로젝트 경로: ${SILVER}${ROOT_DIR}${R}"
log "데이터 디렉토리: ${SILVER}${NAMBI_DIR}${R}"

mkdir -p "$NAMBI_DIR"

# 이미지 빌드
log "Docker 이미지 빌드 중: ${CYAN}${IMAGE_NAME}${R}"
printf "${DIM}  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌${R}\n"
docker build -f "$ROOT_DIR/docker/Dockerfile" -t "$IMAGE_NAME" "$ROOT_DIR"
printf "${DIM}  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌${R}\n"
ok "이미지 빌드 완료"

# 설정 파일 없으면 초기 설정 (호스트에서 직접 실행 — docker run -it 불필요)
if [ ! -s "$NAMBI_DIR/.env.enc" ]; then
  warn "설정 파일 없음 — 초기 설정을 시작합니다"
  NAMBI_DIR="$NAMBI_DIR" bash "$ROOT_DIR/scripts/setup-env.sh"
fi

# 패스프레이즈 확인 (.passphrase 파일 → 환경변수 → 직접 입력 순)
PASS_FILE="$NAMBI_DIR/.passphrase"
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
    err "패스프레이즈가 비어 있습니다. 종료합니다."
    exit 1
  fi
fi

# 암호화 파일에서 WEB_PORT 추출
WEB_PORT=$(NAMBI_PASSPHRASE="$NAMBI_PASSPHRASE" node "$ROOT_DIR/scripts/env-crypto.js" decrypt \
  < "$NAMBI_DIR/.env.enc" 2>/dev/null \
  | grep '^WEB_PORT=' | cut -d= -f2 | tr -d ' ' || echo "")
WEB_PORT=${WEB_PORT:-3000}

# 기존 컨테이너 제거
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME" 2>/dev/null; then
  _status=$(docker inspect --format '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "unknown")
  log "기존 컨테이너 종료 및 제거: ${CYAN}${CONTAINER_NAME}${R}  (${_status})"
  docker rm -f "$CONTAINER_NAME" > /dev/null
  ok "기존 컨테이너 제거 완료"
fi

# 포트 중복 검사
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
  printf "${BRED}  │${R}     ${DIM}./examples/reconfigure.sh${R}               ${BRED}│${R}\n"
  printf "${BRED}  ╰─────────────────────────────────────────────╯${R}\n"
  echo ""
  exit 1
fi

log "컨테이너 시작: ${CYAN}${CONTAINER_NAME}${R}  포트: ${CYAN}${WEB_PORT}${R}"

docker run -d \
  --name "$CONTAINER_NAME" \
  -v "$NAMBI_DIR:/root/.nambi" \
  -p "${WEB_PORT}:${WEB_PORT}" \
  -e "NAMBI_PASSPHRASE=${NAMBI_PASSPHRASE}" \
  -e "NAMBI_DOCKER=1" \
  --restart no \
  "$IMAGE_NAME" > /dev/null

ok "배포 완료"
echo ""
_url="http://localhost:${WEB_PORT}"
_pad=$(printf '%*s' $((32 - ${#_url})) '')
printf "${BGREEN}  ╭────────────────────────────────────────────╮${R}\n"
printf "${BGREEN}  │${R}  ${BCYAN}Web UI${R}  ${BWHITE}${_url}${R}${_pad}  ${BGREEN}│${R}\n"
printf "${BGREEN}  ╰────────────────────────────────────────────╯${R}\n"
echo ""
sleep 1
printf "${BCYAN}  로그를 출력합니다.${R}  ${BYELLOW}Ctrl+C${R}${SILVER}로 로그 보기만 종료됩니다.${R}\n"
printf "${DIM}--- ─────────────────────────────────────── ---${R}\n"
{ sleep 4 && printf "\n${BYELLOW}  ↑ Ctrl+C${R}${SILVER}로 로그 보기 종료 (봇은 계속 실행됩니다)${R}\n${DIM}--- ─────────────────────────────────────── ---${R}\n"; } &
HINT_PID=$!
NAMBI_CONTAINER="$CONTAINER_NAME" python3 -c "
import os, sys, subprocess, signal
try:
    import termios
    fd = os.open('/dev/tty', os.O_RDWR)
    a = termios.tcgetattr(fd)
    a[3] |= termios.ISIG
    termios.tcsetattr(fd, termios.TCSANOW, a)
    os.close(fd)
except: pass
c = os.environ['NAMBI_CONTAINER']
p = subprocess.Popen(['docker','logs','-f',c], preexec_fn=os.setsid)
def h(s,f):
    try: p.kill()
    except: pass
    os._exit(0)
signal.signal(signal.SIGINT, h)
try: p.wait()
except KeyboardInterrupt:
    try: p.kill()
    except: pass
" || docker logs -f "$CONTAINER_NAME" 2>&1 || true
kill $HINT_PID 2>/dev/null || true; wait $HINT_PID 2>/dev/null || true
printf "${SILVER}--- ─────────────────────────────────────── ---${R}\n"
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$" 2>/dev/null; then
  ok "로그 보기 종료. 봇은 계속 실행 중입니다."
else
  EXIT_CODE=$(docker inspect --format '{{.State.ExitCode}}' "$CONTAINER_NAME" 2>/dev/null || echo "?")
  err "봇이 종료되었습니다. (exit ${EXIT_CODE})"
  docker rm "$CONTAINER_NAME" > /dev/null 2>&1 || true
  echo ""
  if [ "$EXIT_CODE" = "0" ]; then
    printf "${BYELLOW}  ╭─────────────────────────────────────────────╮${R}\n"
    printf "${BYELLOW}  │${R}  Discord 설정값이 올바르지 않습니다.        ${BYELLOW}│${R}\n"
    printf "${BYELLOW}  │${R}  설정 파일이 초기화되었습니다.              ${BYELLOW}│${R}\n"
    printf "${BYELLOW}  │${R}                                             ${BYELLOW}│${R}\n"
    printf "${BYELLOW}  │${R}  다시 배포하면 설정을 새로 입력합니다.      ${BYELLOW}│${R}\n"
    printf "${BYELLOW}  │${R}  ${DIM}./examples/docker-run.sh${R}                   ${BYELLOW}│${R}\n"
    printf "${BYELLOW}  ╰─────────────────────────────────────────────╯${R}\n"
  else
    printf "${BRED}  ╭─────────────────────────────────────────────╮${R}\n"
    printf "${BRED}  │${R}  봇 기동에 실패했습니다.                    ${BRED}│${R}\n"
    printf "${BRED}  │${R}  Discord 설정값을 확인해주세요.             ${BRED}│${R}\n"
    printf "${BRED}  │${R}                                             ${BRED}│${R}\n"
    printf "${BRED}  │${R}  설정을 다시 입력하려면:                    ${BRED}│${R}\n"
    printf "${BRED}  │${R}  ${DIM}./examples/reconfigure.sh${R}                  ${BRED}│${R}\n"
    printf "${BRED}  ╰─────────────────────────────────────────────╯${R}\n"
  fi
  echo ""
fi
