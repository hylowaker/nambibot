#!/bin/bash

set -e

R='\033[0m'
DIM='\033[2m'
BCYAN='\033[1;36m'
BGREEN='\033[1;32m'
BYELLOW='\033[1;33m'
BRED='\033[1;31m'
CYAN='\033[36m'
SILVER='\033[37m'

ts()   { date '+%Y-%m-%d %H:%M:%S.%3N'; }
log()  { printf "${DIM}$(ts)${R}  ${BCYAN}INFO ${R}  $*\n"; }
ok()   { printf "${DIM}$(ts)${R}  ${BCYAN}INFO ${R}  $*\n"; }
warn() { printf "${DIM}$(ts)${R}  ${BYELLOW}WARN ${R}  $*\n" >&2; }
err()  { printf "${DIM}$(ts)${R}  ${BRED}ERROR${R}  $*\n" >&2; }
skip() { printf "${DIM}$(ts)${R}  ${DIM}SKIP ${R}  $*\n"; }

CONTAINER_NAME="nambibot"
IMAGE_NAME="nambibot"
NAMBI_DIR="$HOME/.nambi"
PID_FILE="$NAMBI_DIR/nambibot.pid"
SERVICE_NAME="nambibot"

_ver=$(grep '"version"' "$(cd "$(dirname "$0")/.." && pwd)/package.json" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
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

STOPPED=""

_CONTAINERS=$(docker ps -a --filter "ancestor=${IMAGE_NAME}" --format '{{.Names}}' 2>/dev/null || true)
if [ -n "$_CONTAINERS" ]; then
  while IFS= read -r cname; do
    STATUS=$(docker inspect --format '{{.State.Status}}' "$cname" 2>/dev/null || echo "unknown")
    if [ "$STATUS" = "running" ] || [ "$STATUS" = "restarting" ]; then
      log "컨테이너 중지: ${CYAN}${cname}${R}  (${STATUS})"
      docker stop -t 10 "$cname" > /dev/null
      ok "컨테이너 중지 완료: ${CYAN}${cname}${R}"
      STOPPED="${STOPPED}docker "
    else
      skip "컨테이너 이미 중지됨: ${CYAN}${cname}${R}  (${STATUS})"
    fi
  done <<< "$_CONTAINERS"
else
  skip "Docker 컨테이너 없음"
fi

if systemctl --user is-active "$SERVICE_NAME" > /dev/null 2>&1; then
  log "systemd 사용자 서비스 중지: ${CYAN}${SERVICE_NAME}${R}"
  systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
  ok "systemd 사용자 서비스 중지 완료"
  STOPPED="${STOPPED}systemd "
elif systemctl is-active "$SERVICE_NAME" > /dev/null 2>&1; then
  log "systemd 시스템 서비스 중지: ${CYAN}${SERVICE_NAME}${R}"
  sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  ok "systemd 시스템 서비스 중지 완료"
  STOPPED="${STOPPED}systemd "
else
  skip "systemd 서비스 없음 또는 이미 중지됨"
fi

NODE_PIDS=""

if [ -f "$PID_FILE" ] && [ -s "$PID_FILE" ]; then
  _filepid=$(cat "$PID_FILE")
  if kill -0 "$_filepid" 2>/dev/null; then
    NODE_PIDS="$_filepid"
  else
    rm -f "$PID_FILE"
  fi
fi

_pgrep_pids=$(pgrep -f "node.*index\.js" 2>/dev/null || true)
for _pp in $_pgrep_pids; do
  echo "$NODE_PIDS" | grep -qw "$_pp" 2>/dev/null && continue
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
    warn "정상 종료 실패 — 강제 종료 (SIGKILL):${CYAN}${still}${R}"
    kill -9 $still 2>/dev/null || true
  fi

  rm -f "$PID_FILE"
  ok "Node.js 프로세스 종료 완료"
  STOPPED="${STOPPED}node "
else
  skip "실행 중인 Node.js 프로세스 없음"
  rm -f "$PID_FILE" 2>/dev/null || true
fi

echo ""
if [ -n "$STOPPED" ]; then
  _summary=""
  echo "$STOPPED" | grep -q "docker"  && _summary="${_summary}Docker 컨테이너, "
  echo "$STOPPED" | grep -q "systemd" && _summary="${_summary}systemd 서비스, "
  echo "$STOPPED" | grep -q "node"    && _summary="${_summary}Node.js 프로세스, "
  _summary=$(echo "$_summary" | sed 's/, $//')
  _dw() { echo -n "$1" | wc -L; }
  _line() { local text="$1" color="$2" tw=$(_dw "$1"); printf "${BGREEN}  │${R}  ${color}${text}${R}$(printf '%*s' $((42 - tw)) '')${BGREEN}│${R}\n"; }
  printf "${BGREEN}  ╭────────────────────────────────────────────╮${R}\n"
  printf "${BGREEN}  │${R}                                            ${BGREEN}│${R}\n"
  _line "종료 완료" "$BCYAN"
  _line "$_summary" "$DIM"
  printf "${BGREEN}  │${R}                                            ${BGREEN}│${R}\n"
  _line "데이터/설정은 유지됩니다." "$SILVER"
  _line "$NAMBI_DIR" "$DIM"
  printf "${BGREEN}  │${R}                                            ${BGREEN}│${R}\n"
  printf "${BGREEN}  ╰────────────────────────────────────────────╯${R}\n"
else
  ok "종료할 프로세스가 없습니다."
fi
echo ""
