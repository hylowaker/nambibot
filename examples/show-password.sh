#!/bin/bash
# Web UI 비밀번호를 평문으로 출력하는 스크립트
#
# 사용법:
#   ./examples/show-password.sh

set -e

R='\033[0m'
DIM='\033[90m'
BCYAN='\033[1;36m'
BYELLOW='\033[1;33m'
BRED='\033[1;31m'
SILVER='\033[37m'

ts()   { date '+%Y-%m-%d %H:%M:%S.%3N'; }
log()  { printf "${DIM}$(ts)${R}  ${BCYAN}INFO ${R}  $*\n"; }
err()  { printf "${DIM}$(ts)${R}  ${BRED}ERROR${R}  $*\n" >&2; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
NAMBI_DIR="$HOME/.nambi"
ENC_FILE="$NAMBI_DIR/.env.enc"
PASS_FILE="$NAMBI_DIR/.passphrase"

# 설정 파일 확인
if [ ! -f "$ENC_FILE" ] || [ ! -s "$ENC_FILE" ]; then
  err "설정 파일이 없습니다: ${ENC_FILE}"
  err "먼저 배포를 실행해주세요."
  exit 1
fi

# 패스프레이즈 확인 (.passphrase 파일 → 환경변수 → 직접 입력 순)
if [ -z "$NAMBI_PASSPHRASE" ] && [ -f "$PASS_FILE" ] && [ -s "$PASS_FILE" ]; then
  NAMBI_PASSPHRASE=$(cat "$PASS_FILE")
elif [ -z "$NAMBI_PASSPHRASE" ]; then
  printf "  ${BCYAN}?${R}  패스프레이즈를 입력하세요  ${SILVER}›${R} "
  read -r -s NAMBI_PASSPHRASE
  echo ""
  if [ -z "$NAMBI_PASSPHRASE" ]; then
    err "패스프레이즈가 비어 있습니다."
    exit 1
  fi
fi

# 복호화
DECRYPTED=$(NAMBI_PASSPHRASE="$NAMBI_PASSPHRASE" node "$ROOT_DIR/scripts/env-crypto.js" decrypt \
  < "$ENC_FILE" 2>/dev/null) || {
  err "복호화 실패: 잘못된 패스프레이즈이거나 파일이 손상되었습니다."
  exit 1
}

# WEB_PASSWORD 추출
WEB_PASSWORD=$(echo "$DECRYPTED" | grep '^WEB_PASSWORD=' | cut -d= -f2-)

echo ""
if [ -z "$WEB_PASSWORD" ]; then
  printf "  ${BYELLOW}Web UI 비밀번호가 설정되어 있지 않습니다. (인증 없음)${R}\n"
else
  printf "  ${BCYAN}Web UI 비밀번호${R}  ${SILVER}›${R}  ${BYELLOW}${WEB_PASSWORD}${R}\n"
fi
echo ""
