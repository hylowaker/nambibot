#!/bin/bash

trap 'printf "\n"; exit 130' INT TERM

RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
BCYAN='\033[1;36m'
GREEN='\033[32m'
BGREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[31m'
BRED='\033[1;31m'
SILVER='\033[37m'
WHITE='\033[97m'
BWHITE='\033[1;97m'

ok()   { printf "  ${BGREEN}✓${RESET}  $*\n"; }
fail() { printf "  ${BRED}✗${RESET}  $*\n"; }
warn() { printf "  ${YELLOW}⚠${RESET}  $*\n"; }
info() { printf "  ${CYAN}·${RESET}  $*\n"; }
hint() { printf "  ${SILVER}  $*${RESET}\n"; }
ex()   { printf "  ${DIM}  예시: $*${RESET}\n"; }

section() {
  echo ""
  printf "  ${BCYAN}${BOLD}$*${RESET}\n"
  printf "  ${SILVER}$(printf '─%.0s' $(seq 1 44))${RESET}\n"
}

read_masked() {
  local var="$1"
  local value="" char entered=0
  while IFS= read -r -s -n1 char; do
    if [[ -z "$char" ]]; then
      entered=1
      break
    elif [[ "$char" == $'\177' ]]; then
      if [[ -n "$value" ]]; then
        value="${value%?}"
        printf '\b \b'
      fi
    else
      value+="$char"
      printf '*'
      entered=1
    fi
  done
  printf '\n'
  eval "$var=\"\$value\""
  [[ $entered -eq 1 ]]
}

ask() {
  local var="$1" label="$2" secret="$3"
  printf "  ${BWHITE}?${RESET}  ${label}  ${CYAN}›${RESET} "
  if [ "$secret" = "secret" ]; then
    read_masked "$var" || exit 1
  else
    local value
    read -r value || exit 1
    eval "$var=\"\$value\""
  fi
}

ask_default() {
  local var="$1" label="$2" default="$3" value
  printf "  ${BWHITE}?${RESET}  ${label}  ${CYAN}(기본값: ${default}) ›${RESET} "
  read -r value || exit 1
  eval "$var=\"\${value:-$default}\""
}

ask_yn() {
  local var="$1" label="$2" value
  while true; do
    printf "  ${BWHITE}?${RESET}  ${label}  ${CYAN}(y/N) ›${RESET} "
    read -r value || exit 1
    case "$value" in
      [yY]) eval "$var=y"; return ;;
      [nN]|"") eval "$var=n"; return ;;
      *) warn "y 또는 N을 입력해주세요." ;;
    esac
  done
}

NAMBI_DIR="${NAMBI_DIR:-$HOME/.nambi}"
ENV_FILE="$NAMBI_DIR/.env"
ENC_FILE="$NAMBI_DIR/.env.enc"
PASS_FILE="$NAMBI_DIR/.passphrase"
CRYPTO_SCRIPT="$(cd "$(dirname "$0")" && pwd)/env-crypto.js"

_ver=$(grep '"version"' "$(cd "$(dirname "$0")/.." && pwd)/package.json" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
_sub="Discord Music Bot  v${_ver}"
_pad=$(printf '%*s' $((68 - ${#_sub})) '')
clear 2>/dev/null || true
echo ""
printf "${BCYAN}  ███╗   ██╗ █████╗ ███╗   ███╗██████╗ ██╗██████╗  ██████╗ ████████╗${RESET}\n"
printf "${BCYAN}  ████╗  ██║██╔══██╗████╗ ████║██╔══██╗██║██╔══██╗██╔═══██╗╚══██╔══╝${RESET}\n"
printf "${BCYAN}  ██╔██╗ ██║███████║██╔████╔██║██████╔╝██║██████╔╝██║   ██║   ██║   ${RESET}\n"
printf "${BCYAN}  ██║╚██╗██║██╔══██║██║╚██╔╝██║██╔══██╗██║██╔══██╗██║   ██║   ██║   ${RESET}\n"
printf "${BCYAN}  ██║ ╚████║██║  ██║██║ ╚═╝ ██║██████╔╝██║██████╔╝╚██████╔╝   ██║   ${RESET}\n"
printf "${BCYAN}  ╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝     ╚═╝╚═════╝ ╚═╝╚═════╝  ╚═════╝    ╚═╝   ${RESET}\n"
printf "${_pad}${DIM}${_sub}${RESET}\n"
echo ""
hint "설정 파일은 AES-256 암호화 후 저장됩니다."
hint "저장 경로: ${SILVER}$NAMBI_DIR"
echo ""

if [ -f "$ENC_FILE" ] && [ -s "$ENC_FILE" ]; then
  ok "암호화된 설정 파일이 이미 존재합니다."
  info "${SILVER}$ENC_FILE"
  echo ""
  exit 0
fi

mkdir -p "$NAMBI_DIR"
rm -f "$ENV_FILE"
> "$ENV_FILE"

section "Discord 설정"
hint "Discord Developer Portal 에서 확인할 수 있습니다."
hint "${YELLOW}https://discord.com/developers/applications"
echo ""

while true; do
  ask "DISCORD_TOKEN" "${CYAN}DISCORD_TOKEN  봇 토큰" "secret"
  if [ -z "$DISCORD_TOKEN" ]; then
    warn "봇 토큰을 입력해주세요."
    ex "MTxxxxxxxxxxxxxxxxxx.Xxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    continue
  fi
  if ! echo "$DISCORD_TOKEN" | grep -qE '^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{25,}$'; then
    warn "올바른 봇 토큰 형식이 아닙니다."
    ex "MTxxxxxxxxxxxxxxxxxx.Xxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    continue
  fi
  ok "${SILVER}DISCORD_TOKEN 확인됨"
  break
done
echo "DISCORD_TOKEN=$DISCORD_TOKEN" >> "$ENV_FILE"

echo ""

while true; do
  ask "APPLICATION_ID" "${CYAN}APPLICATION_ID  애플리케이션(클라이언트) ID"
  if ! echo "$APPLICATION_ID" | grep -qE '^[0-9]{17,19}$'; then
    warn "올바른 애플리케이션 ID 형식이 아닙니다. (17~19자리 숫자)"
    ex "1484010851659681974"
    continue
  fi
  ok "${SILVER}APPLICATION_ID 확인됨"
  break
done
echo "APPLICATION_ID=$APPLICATION_ID" >> "$ENV_FILE"

echo ""

while true; do
  ask "GUILD_ID" "${CYAN}GUILD_ID  서버(길드) ID"
  if ! echo "$GUILD_ID" | grep -qE '^[0-9]{17,19}$'; then
    warn "올바른 서버 ID 형식이 아닙니다. (17~19자리 숫자)"
    ex "279527580770500608"
    continue
  fi
  ok "${SILVER}GUILD_ID 확인됨"
  break
done
echo "GUILD_ID=$GUILD_ID" >> "$ENV_FILE"

section "Web UI 설정"
echo ""

while true; do
  ask_default "WEB_PORT_VAL" "${CYAN}WEB_PORT  Web UI 포트" "3000"
  if [[ ! "$WEB_PORT_VAL" =~ ^[0-9]+$ ]] || \
     [ "$WEB_PORT_VAL" -lt 1 ] || [ "$WEB_PORT_VAL" -gt 65535 ]; then
    warn "올바른 포트 번호가 아닙니다. (1~65535 사이의 숫자)"
    continue
  fi
  break
done
echo "WEB_PORT=${WEB_PORT_VAL}" >> "$ENV_FILE"

echo ""
ask_default "WEB_UI_URL_VAL" "${CYAN}WEB_UI_URL  외부에서 접속하는 Web UI 주소" "http://localhost:${WEB_PORT_VAL}"
hint "Discord /music webui 명령어로 이 주소가 표시됩니다."
hint "역방향 프록시 등으로 외부 노출 시 실제 URL 입력 권장"
hint "예시: https://music.example.com  또는  http://myserver.com:${WEB_PORT_VAL}"
echo "WEB_UI_URL=${WEB_UI_URL_VAL}" >> "$ENV_FILE"

echo ""
printf "  ${YELLOW}╔══════════════════════════════════════════╗${RESET}\n"
printf "  ${YELLOW}║  !  보안 권장사항                        ║${RESET}\n"
printf "  ${YELLOW}║     퍼블릭 호스팅 시 반드시 비밀번호를   ║${RESET}\n"
printf "  ${YELLOW}║     설정하세요. 비워두면 누구나 접근     ║${RESET}\n"
printf "  ${YELLOW}║     가능합니다.                          ║${RESET}\n"
printf "  ${YELLOW}╚══════════════════════════════════════════╝${RESET}\n"
echo ""

while true; do
  ask "WEB_PASS_VAL" "${CYAN}WEB_PASSWORD  Web UI 비밀번호 (비워두면 인증 없음)" "secret"
  if [ -z "$WEB_PASS_VAL" ]; then
    warn "비밀번호가 설정되지 않았습니다. 누구나 Web UI에 접근할 수 있습니다."
    ask_yn "CONFIRM_NO_PASS" "${CYAN}비밀번호 없이 계속하시겠습니까?"
    [ "$CONFIRM_NO_PASS" = "y" ] && break
    continue
  fi
  ask "WEB_PASS_CONFIRM" "${CYAN}WEB_PASSWORD  비밀번호 확인" "secret"
  if [ "$WEB_PASS_VAL" != "$WEB_PASS_CONFIRM" ]; then
    warn "비밀번호가 일치하지 않습니다. 다시 입력해주세요."
    continue
  fi
  ok "Web UI 비밀번호 설정됨"
  break
done
echo "WEB_PASSWORD=${WEB_PASS_VAL}" >> "$ENV_FILE"

section "기타 설정"
echo ""

ask_yn "DEV_MODE" "${CYAN}개발 모드 활성화  /dev-music, /dev-version 으로 등록"
if [ "$DEV_MODE" = "y" ]; then
  echo "DEVELOPE_PREFIX=ON" >> "$ENV_FILE"
  ok "개발 모드 활성화"
else
  echo "DEVELOPE_PREFIX=" >> "$ENV_FILE"
fi

section "설정 파일 암호화"
hint "패스프레이즈는 자동으로 생성되어 .passphrase 에 저장됩니다."
echo ""

PASSPHRASE=$(LC_ALL=C tr -dc 'A-Za-z0-9!@#$%^&*_-' < /dev/urandom | head -c 32)
if [ -z "$PASSPHRASE" ]; then
  fail "패스프레이즈 생성에 실패했습니다."
  exit 1
fi
ok "패스프레이즈가 자동으로 생성되었습니다."

echo ""
printf "  ${CYAN}·${RESET}  암호화 중..."
if NAMBI_PASSPHRASE="$PASSPHRASE" node "$CRYPTO_SCRIPT" encrypt < "$ENV_FILE" > "$ENC_FILE" 2>/dev/null; then
  printf '%s' "$PASSPHRASE" > "$PASS_FILE"
  chmod 600 "$PASS_FILE"
  rm -f "$ENV_FILE"
  printf "\r  ${BGREEN}✓${RESET}  암호화 완료          \n"
else
  printf "\r  ${BRED}✗${RESET}  암호화 실패\n"
  rm -f "$ENC_FILE" "$ENV_FILE"
  exit 1
fi

echo ""
printf "${BGREEN}${BOLD}"
echo "  ╭────────────────────────────────────────────╮"
echo "  │                                            │"
echo "  │   ✓  설정이 완료되었습니다                 │"
echo "  │                                            │"
echo "  ╰────────────────────────────────────────────╯"
printf "${RESET}"
echo ""
info "설정 파일    ${SILVER}$ENC_FILE"
info "패스프레이즈  ${SILVER}$PASS_FILE"
echo ""
