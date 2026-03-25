#!/bin/bash

set -e

R='\033[0m'
DIM='\033[2m'
BCYAN='\033[1;36m'
BGREEN='\033[1;32m'
BYELLOW='\033[1;33m'
BRED='\033[1;31m'
BWHITE='\033[1;97m'
SILVER='\033[37m'
CYAN='\033[36m'

ts()   { date '+%Y-%m-%d %H:%M:%S.%3N'; }
log()  { printf "${DIM}$(ts)${R}  ${BCYAN}INFO ${R}  $*\n"; }
ok()   { printf "${DIM}$(ts)${R}  ${BCYAN}INFO ${R}  $*\n"; }
err()  { printf "${DIM}$(ts)${R}  ${BRED}ERROR${R}  $*\n" >&2; }
warn() { printf "${DIM}$(ts)${R}  ${BYELLOW}WARN ${R}  $*\n" >&2; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
NAMBI_DIR="$HOME/.nambi"
ENC_FILE="$NAMBI_DIR/.env.enc"
PASS_FILE="$NAMBI_DIR/.passphrase"

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

if [ ! -f "$ENC_FILE" ] || [ ! -s "$ENC_FILE" ]; then
  err "설정 파일이 없습니다: ${SILVER}${ENC_FILE}${R}"
  err "먼저 배포를 실행해주세요."
  exit 1
fi

if [ -z "$NAMBI_PASSPHRASE" ] && [ -f "$PASS_FILE" ] && [ -s "$PASS_FILE" ]; then
  NAMBI_PASSPHRASE=$(cat "$PASS_FILE")
  log "패스프레이즈: ${SILVER}${PASS_FILE}${R}"
elif [ -n "$NAMBI_PASSPHRASE" ]; then
  log "패스프레이즈: ${SILVER}환경변수 NAMBI_PASSPHRASE${R}"
else
  printf "  ${BWHITE}?${R}  패스프레이즈를 입력하세요  ${SILVER}›${R} "
  read -r -s NAMBI_PASSPHRASE
  echo ""
  if [ -z "$NAMBI_PASSPHRASE" ]; then
    err "패스프레이즈가 비어 있습니다."
    exit 1
  fi
fi

DECRYPTED=$(NAMBI_PASSPHRASE="$NAMBI_PASSPHRASE" node "$ROOT_DIR/tools/env-crypto.js" decrypt \
  < "$ENC_FILE" 2>/dev/null) || {
  err "복호화 실패: 잘못된 패스프레이즈이거나 파일이 손상되었습니다."
  exit 1
}
ok "설정 파일 복호화 완료"

WEB_PASSWORD=$(echo "$DECRYPTED" | grep '^WEB_PASSWORD=' | cut -d= -f2-)

echo ""
if [ -z "$WEB_PASSWORD" ]; then
  printf "${BYELLOW}  ╭────────────────────────────────────────────╮${R}\n"
  printf "${BYELLOW}  │${R}                                            ${BYELLOW}│${R}\n"
  printf "${BYELLOW}  │${R}  Web UI 비밀번호가 설정되지 않았습니다.  ${BYELLOW}│${R}\n"
  printf "${BYELLOW}  │${R}  ${DIM}인증 없이 누구나 접근할 수 있습니다.${R}    ${BYELLOW}│${R}\n"
  printf "${BYELLOW}  │${R}                                            ${BYELLOW}│${R}\n"
  printf "${BYELLOW}  ╰────────────────────────────────────────────╯${R}\n"
else
  _label="Web UI 비밀번호"
  _label_w=15
  _pw_len=${#WEB_PASSWORD}
  _content=$(( _label_w + 2 + _pw_len ))
  _inner=$(( _content > 36 ? _content : 36 ))
  _border=$(printf '─%.0s' $(seq 1 $((_inner + 4))))
  _pw_pad=$(printf '%*s' $((_inner - _content)) '')
  printf "${BGREEN}  ╭${_border}╮${R}\n"
  printf "${BGREEN}  │${R}  ${BCYAN}${_label}${R}  ${BWHITE}${WEB_PASSWORD}${R}${_pw_pad}  ${BGREEN}│${R}\n"
  printf "${BGREEN}  ╰${_border}╯${R}\n"
fi
echo ""
