#!/bin/bash
# 환경변수 설정만 다시 수행하는 스크립트
#
# 사용법:
#   ./examples/reconfigure.sh
#
# 기존 설정(env.enc, passphrase)을 삭제하고 setup-env를 다시 실행합니다.
# Discord 토큰, 서버 ID 등을 잘못 입력했을 때 사용하세요.

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

ts()   { date '+%Y-%m-%d %H:%M:%S.%3N'; }
log()  { printf "${DIM}$(ts)${R}  ${BCYAN}INFO ${R}  $*\n"; }
ok()   { printf "${DIM}$(ts)${R}  ${BGREEN}OK   ${R}  $*\n"; }
warn() { printf "${DIM}$(ts)${R}  ${BYELLOW}WARN ${R}  $*\n" >&2; }
err()  { printf "${DIM}$(ts)${R}  ${BRED}ERROR${R}  $*\n" >&2; }
skip() { printf "${DIM}$(ts)${R}  ${DIM}SKIP ${R}  $*\n"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
NAMBI_DIR="$HOME/.nambi"
ENC_FILE="$NAMBI_DIR/.env.enc"
PASS_FILE="$NAMBI_DIR/.passphrase"
COMMANDS_FILE="$NAMBI_DIR/.commands-deployed"
CONTAINER_NAME="nambibot"

# ── 헤더 ──────────────────────────────────────────────────
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

# ── 실행 중인 컨테이너 확인 ───────────────────────────────
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
  warn "실행 중인 컨테이너가 있습니다: ${CYAN}${CONTAINER_NAME}${R}"
  warn "재설정 전에 컨테이너를 중지합니다."
  docker rm -f "$CONTAINER_NAME" > /dev/null
  ok "컨테이너 중지 완료"
fi

# ── 기존 설정 삭제 ────────────────────────────────────────
if [ -f "$ENC_FILE" ]; then
  log "기존 설정 파일 삭제: ${SILVER}${ENC_FILE}${R}"
  rm -f "$ENC_FILE"
fi

if [ -f "$PASS_FILE" ]; then
  log "패스프레이즈 파일 삭제: ${SILVER}${PASS_FILE}${R}"
  rm -f "$PASS_FILE"
fi

if [ -f "$COMMANDS_FILE" ]; then
  log "슬래시 커맨드 배포 상태 초기화"
  rm -f "$COMMANDS_FILE"
fi

ok "기존 설정 초기화 완료"
echo ""

# ── setup-env 실행 ────────────────────────────────────────
NAMBI_DIR="$NAMBI_DIR" bash "$ROOT_DIR/scripts/setup-env.sh"
