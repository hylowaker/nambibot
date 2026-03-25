<div align="center">

<pre>
  ███╗   ██╗ █████╗ ███╗   ███╗██████╗ ██╗██████╗  ██████╗ ████████╗
  ████╗  ██║██╔══██╗████╗ ████║██╔══██╗██║██╔══██╗██╔═══██╗╚══██╔══╝
  ██╔██╗ ██║███████║██╔████╔██║██████╔╝██║██████╔╝██║   ██║   ██║
  ██║╚██╗██║██╔══██║██║╚██╔╝██║██╔══██╗██║██╔══██╗██║   ██║   ██║
  ██║ ╚████║██║  ██║██║ ╚═╝ ██║██████╔╝██║██████╔╝╚██████╔╝   ██║
  ╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝     ╚═╝╚═════╝ ╚═╝╚═════╝  ╚═════╝   ╚═╝
</pre>

**Discord 음악 봇**

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![Discord.js](https://img.shields.io/badge/Discord.js-14-5865F2?logo=discord&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-지원-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

YouTube, SoundCloud 등의 URL을 Discord 음성 채널이나 웹 브라우저에서 재생하는 봇.
Web UI로 대기열 관리, 타임라인 탐색, 브라우저 직접 청취가 가능.

---

## Quick Start

```bash
git clone https://github.com/hylowaker/nambibot.git && cd nambibot
./scripts/docker-run.sh
```

Docker와 [Discord 봇 토큰](#discord-봇-생성)만 있으면 됨. 처음 실행 시 설정 마법사가 뜸.

---

## 주요 기능

- YouTube / SoundCloud 등 재생 (yt-dlp 기반, 재생목록 지원)
- 음성 채널 없이 웹 브라우저에서 직접 청취
- 대기열 관리 (추가, 삭제, 순서 변경, 셔플, 중복 제거, 바로 재생)
- 재생 바 클릭으로 타임라인 이동 (seek)
- 다음 곡 사전 다운로드로 끊김 없는 전환
- 볼륨 정규화 (loudnorm)
- 대기열 JSON 저장/불러오기
- 재생 히스토리 (최근 20곡)
- Discord 상태 메시지에 현재 곡 표시
- 재기동 후에도 대기열, 히스토리, 로그 유지
- 반응형 Web UI (앨범 아트, 글로우 효과, 애니메이션)
- 실시간 로그 뷰어 (`/logs`)
- Docker 빌드 시 yt-dlp nightly + yt-dlp-ejs 자동 설치

---

## 사전 준비

### Discord 봇 생성

1. [Discord Developer Portal](https://discord.com/developers/applications)에서 앱 생성
2. Bot 탭에서 토큰 발급, 아래 값 메모

   | 항목 | 위치 |
   |------|------|
   | `DISCORD_TOKEN` | Bot → Token |
   | `APPLICATION_ID` | General Information → Application ID |
   | `GUILD_ID` | Discord에서 서버 우클릭 → 서버 ID 복사 (개발자 모드 ON 필요) |

3. Bot → Privileged Gateway Intents에서 `SERVER MEMBERS INTENT`, `MESSAGE CONTENT INTENT` 활성화
4. OAuth2 → URL Generator에서 `bot` + `applications.commands` 스코프로 초대 URL 생성 후 서버에 초대

### 의존성 (Docker 사용 시 불필요)

```bash
# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# ffmpeg
sudo apt install -y ffmpeg

# yt-dlp (nightly 권장)
sudo curl -L https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp \
     -o /usr/local/bin/yt-dlp && sudo chmod +x /usr/local/bin/yt-dlp

# yt-dlp-ejs (권장)
pip3 install yt-dlp-ejs
```

---

## 설치 및 실행

```bash
git clone https://github.com/hylowaker/nambibot.git
cd nambibot
./scripts/docker-run.sh
```

처음 실행하면 설정 마법사가 뜨고, 완료되면 Docker 빌드 + 실행까지 자동으로 진행됨.
설정은 `~/.nambi/.env.enc`에 AES-256-GCM 암호화 저장. 패스프레이즈는 자동 생성.

배포 완료 후 Web UI 주소가 출력됨:

```
  ╭───────────────────────────────────────────────╮
  │  Web UI  https://music.example.com            │
  │  Listen  http://localhost:3000                │
  ╰───────────────────────────────────────────────╯
```

Ctrl+C로 로그만 종료. 봇은 백그라운드에서 계속 실행.

```bash
./scripts/docker-run.sh --logs   # 로그 보기
docker stop nambibot              # 중지
docker restart nambibot           # 재시작
```

<details>
<summary>Docker 없이 실행 (Baremetal / systemd)</summary>

```bash
# Baremetal
./scripts/baremetal-run.sh
./scripts/stop.sh                   # 중지

# systemd 서비스 (자동 시작)
./scripts/systemd-setup.sh
systemctl --user status nambibot
journalctl --user -u nambibot -f
```

</details>

---

## Web UI

`WEB_PASSWORD` 설정 시 로그인 필요 (8자 이상 권장).

### 화면 구성

| 영역 | 내용 |
|------|------|
| **Now Playing** | CD 앨범 아트 + 재생 바 (클릭으로 seek, 호버 시 타임라인 표시) + 일시정지/스킵/삭제 |
| **대기열** | 앨범 썸네일, 검색, 드래그앤드롭, 셔플/중복제거/저장/불러오기 |
| **대기열에 추가** | URL 입력 → 대기열 추가 또는 바로 재생 |
| **음성 채널** | 채널 선택 참가, 연결 상태 표시 |
| **재생 히스토리** | 최근 20곡, 클릭으로 대기열 복원 |

### 브라우저 재생

우하단 🔇 버튼으로 음성 채널 없이 브라우저에서 직접 들을 수 있음.
볼륨 조절, 곡 전환 자동 동기화.

### 실시간 알림

재생, 일시정지, 대기열 변경 등 모든 행동이 접속 중인 모든 클라이언트에 토스트로 표시됨.
Discord 커맨드로 조작해도 웹에 반영.

### 로그 뷰어

`/logs`에서 확인. ANSI 컬러, 레벨 필터, 검색, 시스템 환경 정보. 최대 1,000줄.

---

## 슬래시 명령어

음성 채널에 연결되지 않아도 사용 가능 (`leave` 제외).

**재생 제어**

| 명령어 | 파라미터 | 설명 |
|--------|----------|------|
| `/music jump` | `[인덱스]` | 대기열에서 즉시 재생 |
| `/music remove` | | 현재 곡 삭제 |
| `/music skip` | | 다음 곡으로 스킵 |
| `/music pause` | | 일시정지 |
| `/music resume` | | 재개 |

**대기열 관리**

| 명령어 | 파라미터 | 설명 |
|--------|----------|------|
| `/music add` | `URL` | 대기열에 추가 |
| `/music list` | | 현재 곡 + 대기열 표시 |
| `/music np` | | 현재 재생 중인 곡 확인 |
| `/music qdel` | `[인덱스]` | 대기열 항목 삭제 |
| `/music qclear` | | 대기열 전체 삭제 |
| `/music qshuffle` | | 대기열 섞기 |
| `/music qdedupe` | | 중복 제거 |
| `/music qmove` | `from` `to` | 순서 변경 |

**채널 / 기타**

| 명령어 | 파라미터 | 설명 |
|--------|----------|------|
| `/music join` | `[채널명]` | 음성 채널 참가 |
| `/music leave` | | 음성 채널 퇴장 (재생은 유지) |
| `/music help` | | 명령어 목록 |
| `/music webui` | | Web UI 주소 표시 |
| `/version` | | 봇/런타임 버전 정보 |

자동 동작:
- `add` 시 음성 채널 자동 참가 시도
- 곡 끝나면 다음 곡 자동 재생 (사전 다운로드 활용)
- 재생 오류 시 자동 스킵
- 재생목록 추가 시 중복 자동 제거

---

## 보안

| 항목 | 내용 |
|------|------|
| 비밀번호 | Challenge-Response (SHA-256 + 1회용 nonce), 평문 미전송 |
| 세션 | IP 바인딩 쿠키 |
| 소켓 데이터 | HTTPS 시 AES-256-GCM |
| 입력 검증 | guildId, URL, index, seconds 등 서버 사이드 검증 |
| Rate Limit | 소켓 30회/10초, 로그인 10회 실패 시 15분 잠금 |
| 코드 | JS/HTML 자동 minify |

---

## 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DISCORD_TOKEN` | (필수) | 봇 토큰 |
| `APPLICATION_ID` | (필수) | 앱 ID |
| `GUILD_ID` | (필수) | 서버 ID |
| `WEB_PORT` | `3000` | Web UI 포트 |
| `WEB_UI_URL` | `http://localhost:{포트}` | 외부 접속 URL |
| `WEB_PASSWORD` | | Web UI 비밀번호 |
| `NAMBI_DIR` | `~/.nambi` | 데이터 저장 경로 |
| `YT_DLP_BIN` | PATH | yt-dlp 경로 |
| `FFMPEG_BIN` | PATH | ffmpeg 경로 |
| `DEVELOPE_PREFIX` | | `ON` → `/dev-music`으로 등록 |

---

## 데이터 저장

`~/.nambi/` 아래에 저장.

```
~/.nambi/
├── queue-state.json      # 대기열, 히스토리
├── logs.jsonl            # 로그 (최대 2,000줄)
├── .env.enc              # 암호화된 설정
├── .passphrase           # 패스프레이즈
├── .commands-deployed    # 명령어 등록 완료 플래그
├── nambibot.pid          # PID (Baremetal)
└── nambibot.log          # 로그 (Baremetal)
```

Docker는 `~/.nambi`를 컨테이너에 자동 마운트.

---

## 유지보수

| 스크립트 | 용도 |
|----------|------|
| `docker-run.sh` | 빌드 + 실행 |
| `docker-run.sh --logs` | 로그 보기 |
| `baremetal-run.sh` | 호스트에서 직접 실행 |
| `systemd-setup.sh` | systemd 서비스 등록 |
| `stop.sh` | 중지 |
| `reconfigure.sh` | 설정 재입력 |
| `reset.sh` | 전체 초기화 |
| `show-password.sh` | 비밀번호 확인 |

설정 변경 시: `./scripts/reconfigure.sh` → `./scripts/docker-run.sh`

---
