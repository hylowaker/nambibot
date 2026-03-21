#!/bin/bash
# 실행 중인 nambibot 프로세스/컨테이너만 종료합니다.
# 설정 파일, 데이터, 이미지는 삭제하지 않습니다.
#
# 사용법:
#   ./examples/stop.sh

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
skip() { printf "${DIM}$(ts)${R}  ${DIM}SKIP ${R}  $*\n"; }

CONTAINER_NAME="nambibot"
IMAGE_NAME="nambibot"
NAMBI_DIR="$HOME/.nambi"
PID_FILE="$NAMBI_DIR/nambibot.pid"
SERVICE_NAME="nambibot"

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

FOUND=0

# ── 1. Docker 컨테이너 중지 ───────────────────────────────
_CONTAINERS=$(docker ps -a --filter "ancestor=${IMAGE_NAME}" --format '{{.Names}}' 2>/dev/null || true)
if [ -n "$_CONTAINERS" ]; then
  while IFS= read -r cname; do
    STATUS=$(docker inspect --format '{{.State.Status}}' "$cname" 2>/dev/null || echo "unknown")
    if [ "$STATUS" = "running" ] || [ "$STATUS" = "restarting" ]; then
      log "컨테이너 중지: ${CYAN}${cname}${R}"
      docker stop "$cname" > /dev/null
      ok "중지 완료: ${CYAN}${cname}${R}"
    else
      skip "컨테이너 이미 중지됨: ${CYAN}${cname}${R}  (${STATUS})"
    fi
    FOUND=1
  done <<< "$_CONTAINERS"
else
  skip "실행 중인 Docker 컨테이너 없음"
fi

# ── 2. Node.js 프로세스 종료 (baremetal) ──────────────────
NODE_PIDS=""

# PID 파일 우선 확인
if [ -f "$PID_FILE" ] && [ -s "$PID_FILE" ]; then
  _filepid=$(cat "$PID_FILE")
  if kill -0 "$_filepid" 2>/dev/null; then
    NODE_PIDS="$_filepid"
  else
    # 이미 종료된 프로세스 — PID 파일만 남은 경우
    rm -f "$PID_FILE"
  fi
fi

# pgrep으로 누락된 프로세스 보완 탐지
_pgrep_pids=$(pgrep -f "node.*index\.js" 2>/dev/null || true)
for _pp in $_pgrep_pids; do
  echo "$NODE_PIDS" | grep -qw "$_pp" && continue
  CMD=$(ps -p "$_pp" -o args= 2>/dev/null || echo "")
  echo "$CMD" | grep -q "nambibot\|index\.js" || continue
  NODE_PIDS="${NODE_PIDS:+$NODE_PIDS }$_pp"
done

if [ -n "$NODE_PIDS" ]; then
  for pid in $NODE_PIDS; do
    CMD=$(ps -p "$pid" -o args= 2>/dev/null || echo "")
    log "Node.js 프로세스 종료: ${CYAN}PID=${pid}${R}  ${DIM}${CMD}${R}"
    kill "$pid" 2>/dev/null || true
  done
  # 최대 5초 대기
  for _ in $(seq 1 10); do
    still=""
    for pid in $NODE_PIDS; do
      kill -0 "$pid" 2>/dev/null && still="$still $pid"
    done
    [ -z "$still" ] && break
    sleep 0.5
  done
  still=""
  for pid in $NODE_PIDS; do
    kill -0 "$pid" 2>/dev/null && still="$still $pid"
  done
  if [ -n "$still" ]; then
    warn "강제 종료 (SIGKILL):${CYAN}${still}${R}"
    kill -9 $still 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  ok "Node.js 프로세스 종료 완료"
  FOUND=1
else
  skip "실행 중인 Node.js 프로세스 없음"
  rm -f "$PID_FILE" 2>/dev/null || true
fi

# ── 3. systemd 서비스 중지 ────────────────────────────────
if systemctl list-units --type=service 2>/dev/null | grep -q "${SERVICE_NAME}"; then
  SVC_ACTIVE=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "inactive")
  if [ "$SVC_ACTIVE" = "active" ] || [ "$SVC_ACTIVE" = "activating" ]; then
    log "systemd 서비스 중지: ${CYAN}${SERVICE_NAME}${R}"
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    ok "systemd 서비스 중지 완료"
  else
    skip "systemd 서비스 이미 중지됨  (${SVC_ACTIVE})"
  fi
  FOUND=1
else
  skip "systemd 서비스 없음"
fi

# ── 완료 ──────────────────────────────────────────────────
echo ""
if [ "$FOUND" -eq 1 ]; then
  ok "종료 완료."
else
  ok "종료할 프로세스가 없습니다."
fi
echo ""
