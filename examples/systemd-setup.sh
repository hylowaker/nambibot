#!/bin/bash
# systemd 사용자 서비스로 nambibot을 등록하고 실행하는 스크립트
#
# 사용법:
#   ./examples/systemd-setup.sh
#
# 설정 파일은 ~/.nambi/ 에 저장됩니다.

set -e

# ── 색상 ──────────────────────────────────────────────────
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
CRYPTO_SCRIPT="$ROOT_DIR/scripts/env-crypto.js"
SERVICE_NAME="nambibot"
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/$SERVICE_NAME.service"

mkdir -p "$NAMBI_DIR"
cd "$ROOT_DIR"

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

# ── 설정 파일 없으면 초기 설정 ────────────────────────────
if [ ! -s "$ENC_FILE" ]; then
  warn "설정 파일 없음 — 초기 설정을 시작합니다"
  NAMBI_DIR="$NAMBI_DIR" bash scripts/setup-env.sh
  if [ ! -s "$ENC_FILE" ]; then
    err "설정 파일 생성에 실패했습니다."
    exit 1
  fi
fi

# ── 패스프레이즈 로드 ─────────────────────────────────────
# .passphrase 파일 → 환경변수 → 직접 입력 순
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

# ── 복호화 ────────────────────────────────────────────────
DECRYPTED=$(NAMBI_PASSPHRASE="$NAMBI_PASSPHRASE" node "$CRYPTO_SCRIPT" decrypt < "$ENC_FILE" 2>/dev/null) || {
  err "복호화 실패: 잘못된 패스프레이즈이거나 파일이 손상되었습니다."
  exit 1
}
ok "설정 파일 복호화 완료"

# WEB_PORT 추출
WEB_PORT=$(echo "$DECRYPTED" | grep '^WEB_PORT=' | cut -d= -f2 | tr -d ' ')
WEB_PORT=${WEB_PORT:-3000}

# ── 필수 환경변수 검증 ────────────────────────────────────
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

# ── 시스템 바이너리 확인 ──────────────────────────────────
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

# ── 의존성 설치 ───────────────────────────────────────────
if [ ! -d node_modules ]; then
  log "패키지 설치 중..."
  npm install --silent
  ok "패키지 설치 완료"
fi

# ── 슬래시 명령어 등록 (최초 1회) ────────────────────────
if [ ! -f "$NAMBI_DIR/.commands-deployed" ]; then
  log "슬래시 명령어 등록 중..."
  set +e
  env $(echo "$DECRYPTED" | grep -v '^#' | grep -v '^$' | xargs) node scripts/deploy-commands.js
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
    printf "${BYELLOW}  │${R}  ${DIM}./examples/systemd-setup.sh${R}                ${BYELLOW}│${R}\n"
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
    printf "${BRED}  │${R}  ${DIM}./examples/reconfigure.sh${R}                  ${BRED}│${R}\n"
    printf "${BRED}  ╰─────────────────────────────────────────────╯${R}\n"
    echo ""
    exit 1
  fi
fi

# ── linger 활성화 (로그아웃 후에도 서비스 유지) ──────────
log "linger 활성화: ${SILVER}${USER}${R}"
sudo loginctl enable-linger "$USER"

# ── 서비스 파일 생성 ──────────────────────────────────────
mkdir -p "$SERVICE_DIR"
log "서비스 파일 생성: ${SILVER}${SERVICE_FILE}${R}"

# ExecStart 내 \$\$ → $$ (파일에 기록) → systemd가 $$(...)를 $(...)로 치환하여 bash에 전달
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=NambiBot Discord Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
Environment=NAMBI_DIR=$NAMBI_DIR
ExecStart=/bin/bash -c 'NAMBI_PASSPHRASE=\$\$(cat $PASS_FILE) && exec env \$\$(NAMBI_PASSPHRASE=\$\$NAMBI_PASSPHRASE node $CRYPTO_SCRIPT decrypt < $ENC_FILE 2>/dev/null | grep -v "^#" | grep -v "^\$\$" | xargs) NAMBI_DIR=$NAMBI_DIR node $ROOT_DIR/index.js'

Restart=on-failure
RestartSec=5s

SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=default.target
EOF

ok "서비스 파일 생성 완료"

# ── 서비스 등록 및 시작 ───────────────────────────────────
log "systemd 데몬 재로드..."
systemctl --user daemon-reload
log "서비스 활성화 및 시작: ${CYAN}${SERVICE_NAME}${R}"
systemctl --user enable --now "$SERVICE_NAME"
ok "서비스 등록 및 시작 완료"

echo ""
_url="http://localhost:${WEB_PORT}"
_urlpad=$(printf '%*s' $((32 - ${#_url})) '')
printf "${BGREEN}  ╭────────────────────────────────────────────╮${R}\n"
printf "${BGREEN}  │${R}  ${BCYAN}Web UI${R}  ${BWHITE}${_url}${R}${_urlpad}  ${BGREEN}│${R}\n"
printf "${BGREEN}  ╰────────────────────────────────────────────╯${R}\n"
echo ""
printf "${SILVER}  로그:    ${DIM}journalctl --user -u ${SERVICE_NAME} -f${R}\n"
printf "${SILVER}  상태:    ${DIM}systemctl --user status ${SERVICE_NAME}${R}\n"
printf "${SILVER}  중지:    ${DIM}systemctl --user stop ${SERVICE_NAME}${R}\n"
printf "${SILVER}  재시작:  ${DIM}systemctl --user restart ${SERVICE_NAME}${R}\n"
echo ""
