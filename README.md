<div align="center">

<pre>
  ███╗   ██╗ █████╗ ███╗   ███╗██████╗ ██╗██████╗  ██████╗ ████████╗
  ████╗  ██║██╔══██╗████╗ ████║██╔══██╗██║██╔══██╗██╔═══██╗╚══██╔══╝
  ██╔██╗ ██║███████║██╔████╔██║██████╔╝██║██████╔╝██║   ██║   ██║   
  ██║╚██╗██║██╔══██║██║╚██╔╝██║██╔══██╗██║██╔══██╗██║   ██║   ██║   
  ██║ ╚████║██║  ██║██║ ╚═╝ ██║██████╔╝██║██████╔╝╚██████╔╝   ██║   
  ╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝     ╚═╝╚═════╝ ╚═╝╚═════╝  ╚═════╝   ╚═╝   
</pre>

**Discord 음악 봇** — YouTube URL을 Discord 음성 채널에서 바로 재생

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![Discord.js](https://img.shields.io/badge/Discord.js-14-5865F2?logo=discord&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-지원-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

<kbd>
<img width="1939" height="1190" alt="image" src="https://github.com/user-attachments/assets/cc8bb626-489d-43f8-8b2c-9791da8d18ab" style="border: 20px solid black;" />
</kbd>

---

## Quick Start

```bash
# 1. 저장소 클론
git clone https://github.com/hylowaker/nambibot.git && cd ./nambibot

# 2. 실행 (처음이면 설정 마법사 자동 시작)
./examples/docker-run.sh
```

> **필요한 것:** Docker, Discord 봇 토큰 ([발급 방법](#discord-봇-생성))

---

## 목차

- [Quick Start](#quick-start)
- [기능](#기능)
- [사전 준비](#사전-준비)
  - [Discord 봇 생성](#discord-봇-생성)
  - [의존성 설치](#의존성-설치)
- [설치 및 실행](#설치-및-실행)
  - [방법 1 — Docker (권장)](#방법-1--docker-권장)
  - [방법 2 — Baremetal (백그라운드)](#방법-2--baremetal-백그라운드)
  - [방법 3 — systemd 서비스](#방법-3--systemd-서비스)
- [Web UI](#web-ui)
- [슬래시 명령어](#슬래시-명령어)
- [환경변수 레퍼런스](#환경변수-레퍼런스)
- [데이터 저장](#데이터-저장)
- [유지보수 스크립트](#유지보수-스크립트)

---

## 기능

| 기능 | 설명 |
|------|------|
| 🎵 **음악 재생** | YouTube 단일 영상 및 재생목록 URL 지원 |
| 📋 **대기열 관리** | 추가·삭제·순서 변경·셔플·중복 제거 |
| 💾 **플레이리스트** | 대기열을 저장하고 불러오기 |
| 🖥️ **Web UI** | 브라우저에서 실시간으로 제어하는 대시보드 |
| 📜 **재생 히스토리** | 최근 재생 곡 기록 및 대기열 복원 |
| 🔒 **인증** | 비밀번호 기반 Web UI 접근 제어 + 브루트포스 방지 |
| 📊 **시스템 로그** | 실시간 컬러 로그 뷰어 (브라우저에서 확인) |
| 💿 **영구 저장** | 재기동 후에도 대기열·히스토리·로그 유지 |
| 🐳 **Docker 지원** | 컨테이너 환경 완전 지원, 설정 암호화 보관 |

---

## 사전 준비

### Discord 봇 생성

1. [Discord Developer Portal](https://discord.com/developers/applications)에 접속해 **New Application**을 클릭합니다.

2. 애플리케이션을 만든 뒤 **Bot** 탭으로 이동해 봇을 생성하고, 아래 정보를 기록해 둡니다.

   | 항목 | 위치 |
   |------|------|
   | `DISCORD_TOKEN` | Bot 탭 → **Token** (Reset Token으로 발급) |
   | `APPLICATION_ID` | General Information 탭 → **Application ID** |
   | `GUILD_ID` | Discord 앱에서 서버 아이콘 우클릭 → **서버 ID 복사** ¹ |

   > ¹ **개발자 모드** 활성화 필요: Discord 설정 → 고급 → 개발자 모드 ON

3. **Bot** 탭에서 **Privileged Gateway Intents** 중 아래 항목을 활성화합니다.
   - ✅ `SERVER MEMBERS INTENT`
   - ✅ `MESSAGE CONTENT INTENT`

4. **OAuth2 → URL Generator**에서 초대 URL을 생성해 봇을 서버에 초대합니다.

   - **Scopes**: `bot`, `applications.commands`
   - **Bot Permissions**: `Connect`, `Speak`, `Send Messages`, `View Channels`

---

### 의존성 설치

> Docker를 사용할 경우 아래 설치는 **필요 없습니다**. Dockerfile이 자동으로 처리합니다.

**Node.js 20+**

```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

**ffmpeg**

```bash
# Ubuntu / Debian
sudo apt install -y ffmpeg

# macOS
brew install ffmpeg
```

**yt-dlp**

```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
     -o /usr/local/bin/yt-dlp
sudo chmod +x /usr/local/bin/yt-dlp
```

---

## 설치 및 실행

먼저 저장소를 클론합니다.

```bash
git clone https://github.com/hylowaker/nambibot.git
cd nambibot
```

### 1단계 — 배포 스크립트 실행

```bash
./examples/docker-run.sh
```

처음 실행하면 아래와 같은 **대화형 설정 마법사**가 시작됩니다.

```
  ?  DISCORD_TOKEN  ›  [입력]
  ?  APPLICATION_ID  ›  [입력]
  ?  GUILD_ID  ›  [입력]
  ?  WEB_PORT  ›  3000
  ?  WEB_PASSWORD  ›  [입력 또는 엔터로 건너뜀]
  ?  암호화 패스프레이즈  ›  [입력]
```

설정이 완료되면 Docker 이미지를 빌드하고 컨테이너를 백그라운드로 자동 실행합니다.

> **설정 파일은 `~/.nambi/.env.enc`에 AES-256-GCM으로 암호화**되어 저장됩니다.
> 패스프레이즈는 `~/.nambi/.passphrase`에 별도 보관되며, 이후 재시작 시 자동으로 사용됩니다.

### 2단계 — 실행 확인

배포 완료 후 터미널에 Web UI 주소가 출력되며, 자동으로 로그가 표시됩니다.

```
  ╭────────────────────────────────────────────╮
  │  Web UI  http://localhost:3000             │
  ╰────────────────────────────────────────────╯
```

**Ctrl+C**로 로그 보기를 종료해도 봇은 백그라운드에서 계속 실행됩니다.

### 컨테이너 관리

```bash
./examples/docker-run.sh --logs   # 실시간 로그 보기
docker stop nambibot              # 중지
docker start nambibot             # 시작
docker restart nambibot           # 재시작
docker rm -f nambibot             # 컨테이너 삭제 후 재배포 시 docker-run.sh 재실행
```

> 서버 재부팅 후 자동 재시작이 필요하다면 `docker-run.sh` 내 `--restart no`를
> `--restart unless-stopped`로 변경하세요.

---

<details>
<summary>Docker 없이 실행하는 방법 (Baremetal / systemd)</summary>

> Docker를 사용할 수 없는 환경을 위한 대안입니다.
> Node.js 20+, ffmpeg, yt-dlp를 직접 설치해야 합니다. [의존성 설치](#의존성-설치) 참고.

### Baremetal (백그라운드)

```bash
./examples/baremetal-run.sh
```

처음 실행하면 설정 마법사가 시작되며, 설정은 `~/.nambi/.env.enc`에 **AES-256-GCM으로 암호화**되어 저장됩니다.

```bash
./examples/baremetal-run.sh --logs   # 실행 중인 봇 로그 보기
./examples/stop.sh                   # 중지
./examples/baremetal-run.sh          # 재시작
```

### systemd 서비스 (자동 시작)

서버 재부팅 후에도 자동으로 시작되도록 등록합니다.

```bash
./examples/systemd-setup.sh
```

```bash
systemctl --user status nambibot         # 상태 확인
journalctl --user -u nambibot -f         # 실시간 로그
systemctl --user stop nambibot           # 중지
systemctl --user restart nambibot        # 재시작
systemctl --user disable --now nambibot  # 서비스 제거
```

</details>

---

## Web UI

봇이 실행되면 브라우저에서 `http://localhost:3000` (또는 설정한 포트)에 접속해 Web UI를 사용할 수 있습니다.

> `WEB_PASSWORD`가 설정된 경우 로그인 페이지가 먼저 표시됩니다.

### 대시보드 구성

**헤더** — 봇 프로필 · 연결 상태 · 서버 선택 · 로그 페이지 바로가기

| 메인 영역 | 사이드바 |
|-----------|----------|
| **Now Playing** — CD 애니메이션, 재생 진행 바, 일시정지 / 스킵 / 삭제 | **음성 채널** — 현재 연결 채널 표시, 채널 선택 후 즉시 참가 |
| **대기열** — 검색 필터, 셔플 / 중복 제거 / 저장 / 불러오기 / 전체 삭제 | **재생 히스토리** — 최근 20곡, 대기열 복원 버튼 |
| **대기열에 추가** — YouTube URL 입력 | |

### 로그 뷰어

`/logs` 경로에서 실시간 시스템 로그를 확인할 수 있습니다.

- ANSI 컬러 코드 렌더링 (터미널과 동일한 색상)
- 레벨별 필터 (INFO / WARN / ERROR)
- 키워드 검색
- 시스템 환경 정보 (CPU, 메모리, Node.js 버전 등)
- 서버 재기동 후에도 이전 로그 유지

---

## 슬래시 명령어

Discord 채팅창에서 `/` 입력 후 명령어를 사용합니다.

### `/music` 명령어

| 명령어 | 파라미터 | 설명 |
|--------|----------|------|
| `/music help` | — | 사용 가능한 명령어 목록 출력 |
| `/music join` | `[채널명]` | 음성 채널 참가. 파라미터 없으면 명령 실행자의 채널 참가 |
| `/music queue` | `URL` (필수) | 대기열 마지막에 추가. 재생목록 URL 지원 |
| `/music play` | `[인덱스]` | 대기열에서 즉시 재생. 인덱스 없으면 첫 번째 항목 |
| `/music skip` | — | 현재 곡 스킵 후 다음 곡 재생 |
| `/music stop` | — | 현재 재생 중지 |
| `/music delete` | `[인덱스]` | 대기열 항목 삭제. 인덱스 없으면 마지막 항목 삭제 |
| `/music purge` | — | 대기열 전체 삭제 (현재 재생 중인 곡은 유지) |
| `/music show` | — | 현재 재생 중인 곡과 대기열 목록 출력 |
| `/music leave` | — | 음성 채널 퇴장 (현재 곡은 대기열 맨 앞으로 복원) |

### `/version`

현재 봇 버전, Node.js, yt-dlp, ffmpeg 정보를 출력합니다.

---

### 자동 동작

| 상황 | 동작 |
|------|------|
| `/music queue` 실행 시 봇이 채널에 없을 때 | 명령 실행자의 채널에 자동 참가 |
| 대기열이 비어있고 봇이 채널에 있을 때 곡 추가 | 추가 즉시 자동 재생 |
| 재생 중 오류 발생 (다운로드 실패 등) | 해당 곡 건너뛰고 다음 곡 자동 재생 |
| `/music leave` 실행 시 재생 중인 곡이 있을 때 | 대기열 맨 앞에 복원 |

---

## 환경변수 레퍼런스

`.env.template`를 참고해 설정합니다. Docker 환경에서는 설정 마법사(`setup-env.sh`)가 자동으로 처리합니다.

### 필수

| 변수 | 설명 |
|------|------|
| `DISCORD_TOKEN` | Discord 봇 토큰 |
| `APPLICATION_ID` | Discord 애플리케이션 ID |
| `GUILD_ID` | 슬래시 명령어를 등록할 서버 ID |

### 선택

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `WEB_PORT` | `3000` | Web UI 포트 |
| `WEB_PASSWORD` | (없음) | Web UI 비밀번호. 비워두면 인증 없이 접근 가능 |
| `NAMBI_DIR` | `~/.nambi` | 대기열·로그 등 데이터 저장 경로 |
| `YT_DLP_BIN` | (PATH 탐색) | yt-dlp 실행 파일 경로 |
| `FFMPEG_BIN` | (PATH 탐색) | ffmpeg 실행 파일 경로 |
| `DEVELOPE_PREFIX` | (없음) | `ON` 설정 시 명령어가 `/dev-music`, `/dev-version`으로 등록 |

---

## 데이터 저장

모든 영구 데이터는 `NAMBI_DIR` (기본값: `~/.nambi/`) 아래에 저장됩니다.

```
~/.nambi/
├── queue-state.json      # 대기열 · 재생 히스토리 (서버별)
├── logs.jsonl            # 시스템 로그 (최대 2,000줄, 자동 트림)
├── .env.enc              # 암호화된 설정 파일 (AES-256-GCM)
├── .passphrase           # 암호화 패스프레이즈
├── .commands-deployed    # 슬래시 명령어 등록 완료 표시
├── nambibot.pid          # 프로세스 ID (Baremetal)
└── nambibot.log          # 표준 출력 로그 (Baremetal)
```

| 항목 | 내용 |
|------|------|
| 대기열 | 서버별 대기열, 현재 재생 중인 곡, 재생 히스토리 (최대 20곡) |
| 로그 | JSONL 포맷 (1줄 = 1항목). 부팅 시 최근 500개를 메모리로 복원 |
| 설정 암호화 | AES-256-GCM + PBKDF2 (100,000회 반복) |

### Docker 볼륨 마운트

Docker 컨테이너는 `~/.nambi`를 컨테이너 내부 `/root/.nambi`에 자동 바인드 마운트합니다.

```bash
# docker-run.sh 내부에서 자동 처리됨
docker run -v "$HOME/.nambi:/root/.nambi" ...
```

직접 `docker run`을 사용하는 경우:

```bash
docker run -d \
  --name nambibot \
  -v /호스트/데이터/경로:/root/.nambi \
  -p 3000:3000 \
  -e NAMBI_PASSPHRASE="패스프레이즈" \
  nambibot
```

---

## 유지보수 스크립트

`examples/` 디렉토리에 편의 스크립트가 포함되어 있습니다.

| 스크립트 | 설명 |
|----------|------|
| `docker-run.sh` | Docker 이미지 빌드 및 컨테이너 실행 |
| `docker-run.sh --logs` | 실행 중인 컨테이너 로그 보기 |
| `baremetal-run.sh` | 호스트에서 백그라운드 실행 |
| `baremetal-run.sh --logs` | 실행 중인 봇 로그 보기 |
| `systemd-setup.sh` | systemd 사용자 서비스 등록 |
| `stop.sh` | 실행 중인 프로세스/컨테이너만 중지 (데이터 유지) |
| `reconfigure.sh` | 설정 파일 재설정 (토큰 변경 등) |
| `reset.sh` | 설정 초기화 및 컨테이너/서비스/데이터 전체 제거 |
| `show-password.sh` | 설정된 Web UI 비밀번호 확인 |

### 설정 변경

Discord 토큰이 변경되었거나 설정을 처음부터 다시 하고 싶을 때:

```bash
./examples/reconfigure.sh
```

이후 다시 배포합니다.

```bash
./examples/docker-run.sh      # Docker
./examples/baremetal-run.sh   # Baremetal
./examples/systemd-setup.sh   # systemd
```

---
