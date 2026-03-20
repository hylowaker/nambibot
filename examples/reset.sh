#!/bin/bash
# nambibot 호스트 초기화 스크립트
#
# 실행 중인 모든 nambibot 서비스를 내리고
# 호스트에 남아있는 모든 메타데이터를 삭제합니다.
#
# 사용법:
#   ./examples/reset.sh           # 확인 후 실행
#   ./examples/reset.sh --force   # 확인 없이 강제 실행

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

CONTAINER_NAME="nambibot"
IMAGE_NAME="nambibot"
NAMBI_DIR="$HOME/.nambi"
SERVICE_NAME="nambibot"
FORCE=0

[ "${1}" = "--force" ] && FORCE=1

# ── 헤더 ──────────────────────────────────────────────────
_ver=$(grep '"version"' "$(cd "$(dirname "$0")/.." && pwd)/package.json" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
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

# ── 삭제 대상 미리보기 ────────────────────────────────────
log "삭제 대상 확인 중..."

FOUND=0

_CONTAINERS=$(docker ps -a --filter "ancestor=${IMAGE_NAME}" --format '{{.Names}}' 2>/dev/null || true)
if [ -n "$_CONTAINERS" ]; then
  while IFS= read -r cname; do
    STATUS=$(docker inspect --format '{{.State.Status}}' "$cname" 2>/dev/null || echo "unknown")
    warn "Docker 컨테이너: ${CYAN}${cname}${R}  (${STATUS})"
  done <<< "$_CONTAINERS"
  FOUND=1
fi

if docker images --format '{{.Repository}}' 2>/dev/null | grep -q "^${IMAGE_NAME}$"; then
  SIZE=$(docker images --format '{{.Size}}' "$IMAGE_NAME" 2>/dev/null | head -1)
  warn "Docker 이미지: ${CYAN}${IMAGE_NAME}${R}  (${SIZE})"
  FOUND=1
fi

NODE_PIDS=$(pgrep -f "node.*nambibot" 2>/dev/null || true)
if [ -n "$NODE_PIDS" ]; then
  for pid in $NODE_PIDS; do
    CMD=$(ps -p "$pid" -o args= 2>/dev/null || echo "")
    warn "Node.js 프로세스: ${CYAN}PID=${pid}${R}  ${DIM}${CMD}${R}"
  done
  FOUND=1
fi

if systemctl list-units --type=service 2>/dev/null | grep -q "${SERVICE_NAME}"; then
  SVC_STATUS=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "unknown")
  warn "systemd 서비스: ${CYAN}${SERVICE_NAME}.service${R}  (${SVC_STATUS})"
  FOUND=1
fi

if [ -d "$NAMBI_DIR" ]; then
  DIR_SIZE=$(du -sh "$NAMBI_DIR" 2>/dev/null | cut -f1 || echo "?")
  warn "데이터 디렉토리: ${CYAN}${NAMBI_DIR}${R}  (${DIR_SIZE})"
  FOUND=1
fi

if [ "$FOUND" -eq 0 ]; then
  ok "초기화할 항목이 없습니다."
  echo ""
  exit 0
fi

echo ""

# ── 확인 ──────────────────────────────────────────────────
if [ "$FORCE" -eq 0 ]; then
  printf "${BRED}  ╔══════════════════════════════════════════════╗${R}\n"
  printf "${BRED}  ║  !!  경고: 이 작업은 되돌릴 수 없습니다.     ║${R}\n"
  printf "${BRED}  ║      위 항목이 영구적으로 삭제됩니다.        ║${R}\n"
  printf "${BRED}  ╚══════════════════════════════════════════════╝${R}\n"
  echo ""
  while true; do
    printf "  ${BRED}계속하려면 ${R}${BYELLOW}reset${R}${BRED} 을 입력하세요 (취소: Enter)${R}  ${SILVER}›${R} "
    read -r CONFIRM
    echo ""
    case "$CONFIRM" in
      reset) break ;;
      "") log "취소됨."; exit 0 ;;
      *) warn "'reset' 을 정확히 입력하거나 Enter 로 취소하세요." ;;
    esac
  done
fi

# ── 1. Docker 컨테이너 종료 및 제거 ──────────────────────
_CONTAINERS=$(docker ps -a --filter "ancestor=${IMAGE_NAME}" --format '{{.Names}}' 2>/dev/null || true)
if [ -n "$_CONTAINERS" ]; then
  while IFS= read -r cname; do
    log "컨테이너 중지 및 제거: ${CYAN}${cname}${R}"
    docker rm -f "$cname" > /dev/null
  done <<< "$_CONTAINERS"
  ok "컨테이너 제거 완료"
else
  skip "Docker 컨테이너 없음"
fi

# ── 2. Node.js 프로세스 종료 ──────────────────────────────
NODE_PIDS=$(pgrep -f "node.*nambibot" 2>/dev/null || true)
if [ -n "$NODE_PIDS" ]; then
  for pid in $NODE_PIDS; do
    log "Node.js 프로세스 종료: ${CYAN}PID=${pid}${R}"
    kill "$pid" 2>/dev/null || true
  done
  # 최대 5초 대기
  for _ in $(seq 1 10); do
    REMAINING=$(pgrep -f "node.*nambibot" 2>/dev/null || true)
    [ -z "$REMAINING" ] && break
    sleep 0.5
  done
  REMAINING=$(pgrep -f "node.*nambibot" 2>/dev/null || true)
  if [ -n "$REMAINING" ]; then
    warn "강제 종료 (SIGKILL): ${CYAN}${REMAINING}${R}"
    kill -9 $REMAINING 2>/dev/null || true
  fi
  ok "Node.js 프로세스 종료 완료"
else
  skip "실행 중인 Node.js 프로세스 없음"
fi

# ── 3. systemd 서비스 중지 및 비활성화 ───────────────────
if systemctl list-units --type=service 2>/dev/null | grep -q "${SERVICE_NAME}"; then
  SVC_ACTIVE=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "inactive")
  if [ "$SVC_ACTIVE" = "active" ] || [ "$SVC_ACTIVE" = "activating" ]; then
    log "systemd 서비스 중지: ${CYAN}${SERVICE_NAME}${R}"
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  fi
  if systemctl is-enabled "$SERVICE_NAME" 2>/dev/null | grep -q "enabled"; then
    log "systemd 서비스 비활성화: ${CYAN}${SERVICE_NAME}${R}"
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  fi
  # 서비스 파일 제거
  SVC_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
  if [ -f "$SVC_FILE" ]; then
    log "서비스 파일 제거: ${CYAN}${SVC_FILE}${R}"
    rm -f "$SVC_FILE"
    systemctl daemon-reload 2>/dev/null || true
  fi
  ok "systemd 서비스 정리 완료"
else
  skip "systemd 서비스 없음"
fi

# ── 4. Docker 이미지 제거 ─────────────────────────────────
if docker images --format '{{.Repository}}' 2>/dev/null | grep -q "^${IMAGE_NAME}$"; then
  log "Docker 이미지 제거: ${CYAN}${IMAGE_NAME}${R}"
  docker rmi "$IMAGE_NAME" > /dev/null
  ok "Docker 이미지 제거 완료"
else
  skip "Docker 이미지 없음"
fi

# ── 5. 데이터 디렉토리 제거 ───────────────────────────────
if [ -d "$NAMBI_DIR" ]; then
  log "데이터 디렉토리 제거: ${CYAN}${NAMBI_DIR}${R}"
  rm -rf "$NAMBI_DIR"
  ok "데이터 디렉토리 제거 완료"
else
  skip "데이터 디렉토리 없음"
fi

# ── 완료 ──────────────────────────────────────────────────
echo ""
ok "초기화 완료. 호스트에 nambibot 관련 데이터가 남아있지 않습니다."
echo ""
