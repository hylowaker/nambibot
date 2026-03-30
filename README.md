<div align="center">

<picture>
  <img alt="nambibot" src="web/public/logo.svg" width="600">
</picture>

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![Discord.js](https://img.shields.io/badge/Discord.js-14-5865F2?logo=discord&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-지원-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

YouTube, SoundCloud 같은 URL을 Discord 음성 채널이나 웹 브라우저에서 바로 틀 수 있는 봇.
대기열 관리부터 타임라인 탐색, 브라우저 직접 청취까지 Web UI 하나로 해결.

<kbd>
<img height="1190" alt="image" src="https://github.com/user-attachments/assets/f3c05ff1-fa38-426a-968f-504ca7f070b4" style="border: 20px solid black;" />
</kbd>

---

## 🚀 Quick Start

```bash
git clone https://github.com/hylowaker/nambibot.git && cd nambibot
./scripts/docker-run.sh
```

Docker(또는 Podman, nerdctl)와 [Discord 봇 토큰](#-discord-봇-생성)만 준비하면 끝.
처음 실행하면 설정 마법사가 알아서 안내해 줌.

---

## ✨ 주요 기능

### 🎶 재생

- YouTube, SoundCloud 등 yt-dlp가 지원하는 거의 모든 사이트에서 재생 가능
- 단일 곡은 물론 재생목록(플레이리스트) URL도 한 번에 추가
- 곡 전환 시 다음 곡을 미리 받아두어 끊김 없이 넘어감
- 곡 간 크로스페이드 적용 (서서히 볼륨이 전환)
- loudnorm으로 곡마다 들쭉날쭉한 볼륨을 자동 보정

### 🔊 어디서든 듣기

- Discord 음성 채널에서 듣는 건 기본
- 음성 채널 없이 웹 브라우저에서 직접 들을 수도 있음 (우하단 브라우저 재생 버튼)
- 브라우저의 미디어 컨트롤(잠금화면, 알림바 등)로도 재생/일시정지/탐색 가능
- 둘 다 동시에도 가능. 재생 상태는 실시간으로 동기화됨

### 📋 대기열

- 추가, 삭제, 순서 변경, 셔플, 중복 제거, 바로 재생
- 대기열을 JSON 파일로 저장해두고 나중에 불러올 수 있음
- 재생목록 추가 시 이미 있는 곡은 자동으로 걸러냄
- 드래그앤드롭으로 순서 변경 가능

### 🎯 타임라인 탐색

- 재생 바를 클릭하거나 thumb(동그라미)을 드래그해서 위치 변경 가능
- 마우스를 올리면 그 시점의 시간이 표시됨
- 일시정지 상태에서 타임라인을 옮겨도 자동 재개되지 않고, 재개 버튼을 누르면 그 위치에서 시작
- 로딩이 60초 이상 걸리면 자동으로 다음 곡으로 넘어감

### 🔔 실시간 알림

- 누군가 재생, 일시정지, 대기열 변경 등을 하면 토스트 알림이 모든 클라이언트에 뜸
- Discord 커맨드로 조작해도 웹 UI에 바로 반영
- 알림음도 브라우저와 음성 채널 양쪽에서 동시에 재생

### 🖥️ Web UI

- 반응형 디자인으로 데스크톱/모바일 모두 지원
- 앨범 아트, RGB 글로우 효과, 곡 전환/스킵/삭제 애니메이션
- 재생 바 색상이 재생/일시정지/다운로드 상태에 따라 바뀜
- 봇 프로필 이미지가 파비콘으로 자동 설정
- 브라우저 탭 제목에 현재 곡 정보 표시
- 오프라인 감지 시 자동 UI 전환 + 재연결 시 복원

### 🎧 Discord 연동

- 봇 상태 메시지에 현재 곡 표시 (▶️ 재생 중 / ⏸️ 일시정지 / ⏳ 로딩 중 / 💤 대기)
- 음성 채널 참가/퇴장해도 재생이 끊기지 않음
- 음성 채널에 연결 없이도 모든 커맨드 사용 가능

### 💾 영구 저장

- 서버 재시작 후에도 대기열, 재생 히스토리(최근 20곡), 로그가 유지됨
- 설정 파일은 AES-256-GCM으로 암호화되어 저장

---

## 📦 사전 준비

### 🤖 Discord 봇 생성

1. [Discord Developer Portal](https://discord.com/developers/applications)에서 새 앱을 만든다
2. Bot 탭에서 토큰을 발급하고, 아래 세 가지 값을 메모해 둔다

   | 항목 | 어디서 찾나 |
   |------|------------|
   | `DISCORD_TOKEN` | Bot 탭 → Token (Reset Token으로 발급) |
   | `APPLICATION_ID` | General Information → Application ID |
   | `GUILD_ID` | Discord에서 서버 아이콘 우클릭 → 서버 ID 복사 |

   > 서버 ID 복사가 안 보이면 Discord 설정 → 고급 → 개발자 모드를 켜야 함

3. Bot → Privileged Gateway Intents에서 두 가지를 활성화
   - `SERVER MEMBERS INTENT`
   - `MESSAGE CONTENT INTENT`

4. OAuth2 → URL Generator에서 초대 URL을 만들어 봇을 서버에 초대
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Connect`, `Speak`, `Send Messages`, `View Channels`

### 🔧 의존성 (Docker 쓰면 알아서 설치됨)

Docker를 쓰면 아래는 신경 쓸 필요 없음. Baremetal로 돌릴 때만 직접 설치.

```bash
# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# ffmpeg
sudo apt install -y ffmpeg

# yt-dlp (nightly 권장)
sudo curl -L https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp \
     -o /usr/local/bin/yt-dlp && sudo chmod +x /usr/local/bin/yt-dlp

# yt-dlp-ejs (YouTube JS 서명 처리용, 권장)
pip3 install yt-dlp-ejs
```

---

## ⚙️ 설치 및 실행

```bash
git clone https://github.com/hylowaker/nambibot.git
cd nambibot
./scripts/docker-run.sh
```

처음 실행하면 설정 마법사가 뜨면서 토큰, 포트, 비밀번호 등을 물어봄.
입력이 끝나면 이미지 빌드부터 컨테이너 실행까지 자동으로 진행.
Docker가 없으면 Podman이나 nerdctl을 자동으로 찾아서 사용함.

설정은 `~/.nambi/.env.enc`에 AES-256-GCM으로 암호화 저장되고, 패스프레이즈는 자동 생성되어 `~/.nambi/.passphrase`에 보관됨.

배포가 완료되면 Web UI 주소가 출력됨. 외부 URL을 설정했으면 둘 다 표시됨:

```
  ╭───────────────────────────────────────────────╮
  │  Web UI  https://music.example.com            │
  │  Listen  http://localhost:3000                │
  ╰───────────────────────────────────────────────╯
```

Ctrl+C를 눌러도 봇은 백그라운드에서 계속 실행됨.

```bash
docker stop nambibot       # 중지
docker restart nambibot    # 재시작
```

<details>
<summary>🖥️ Docker 없이 실행하기 (Baremetal / systemd)</summary>

```bash
# 직접 실행 (백그라운드)
./scripts/baremetal-run.sh
./scripts/stop.sh              # 중지

# systemd 서비스로 등록 (서버 재부팅 후 자동 시작)
./scripts/systemd-setup.sh
systemctl --user status nambibot
journalctl --user -u nambibot -f
```

</details>

---

## 🖥️ Web UI

`WEB_PASSWORD`를 설정하면 로그인 페이지가 먼저 뜸 (8자 이상 권장).
Caps Lock이 켜져 있으면 경고도 표시해 줌.

### 📱 화면 구성

| 영역 | 설명 |
|------|------|
| 🎵 **Now Playing** | 돌아가는 CD 앨범 아트, 재생 바 (클릭으로 seek, 호버 시 타임라인), 일시정지/스킵/삭제 버튼. 재생 중이면 카드 테두리에 무지개 글로우 효과 |
| 📋 **대기열** | 앨범 케이스+CD 디스크 썸네일, 제목 검색, 드래그앤드롭 순서 변경, 셔플/중복제거/저장/불러오기/전체삭제 |
| ➕ **대기열에 추가** | URL 입력 후 대기열에 넣거나 바로 재생. 입력이 비어있으면 버튼 비활성화 |
| 🔊 **음성 채널** | 채널 선택해서 바로 참가, 연결 상태 실시간 표시 |
| 📜 **재생 히스토리** | 최근 20곡 기록, 클릭 한 번으로 대기열에 다시 추가 |

### 📊 로그 뷰어

`/logs` 페이지에서 시스템 로그를 실시간으로 확인 가능.
ANSI 컬러 렌더링, 레벨 필터(INFO/WARN/ERROR), 키워드 검색, 시스템 환경 정보까지 제공. 최대 1,000줄 보관.

---

## 💬 슬래시 명령어

음성 채널에 연결되지 않은 상태에서도 사용 가능 (`leave` 제외).

**▶️ 재생 제어**

| 명령어 | 파라미터 | 설명 |
|--------|----------|------|
| `/music jump` | `[인덱스]` | 대기열에서 골라서 바로 재생 |
| `/music remove` | | 지금 재생 중인 곡 삭제 |
| `/music skip` | | 다음 곡으로 넘기기 (현재 곡은 맨 뒤로) |
| `/music pause` | | 일시정지 |
| `/music resume` | | 재개 |

**📋 대기열 관리**

| 명령어 | 파라미터 | 설명 |
|--------|----------|------|
| `/music add` | `URL` | 대기열 맨 뒤에 추가 |
| `/music list` | | 지금 재생 중인 곡과 대기열 목록 보기 |
| `/music np` | | 지금 뭐 재생 중인지 확인 |
| `/music qdel` | `[인덱스]` | 대기열에서 특정 곡 삭제 |
| `/music qclear` | | 대기열 전체 비우기 |
| `/music qshuffle` | | 대기열 순서 랜덤으로 섞기 |
| `/music qdedupe` | | 중복 곡 자동 제거 |
| `/music qmove` | `from` `to` | 대기열 내 곡 순서 이동 |

**🎤 채널 / 기타**

| 명령어 | 파라미터 | 설명 |
|--------|----------|------|
| `/music join` | `[채널명]` | 음성 채널에 봇 참가 |
| `/music leave` | | 음성 채널에서 나가기 (재생은 계속됨) |
| `/music help` | | 전체 명령어 목록 |
| `/music webui` | | Web UI 주소 표시 |
| `/version` | | 봇, Node.js, yt-dlp, ffmpeg 버전 정보 |

🤖 **알아서 하는 것들:**
- `add`할 때 봇이 채널에 없으면 자동으로 참가 시도
- 곡이 끝나면 다음 곡 자동 재생 (미리 다운받아둔 걸로 바로 넘어감)
- 재생 실패하면 알아서 건너뛰고 다음 곡으로
- 재생목록 추가 시 이미 대기열에 있는 곡은 자동으로 걸러냄

---

## 🔒 보안

| 항목 | 어떻게 |
|------|--------|
| 🔑 비밀번호 | Challenge-Response 방식 (SHA-256 + 1회용 nonce). HTTP에서도 비밀번호 평문이 네트워크에 노출되지 않음 |
| 🌐 세션 | IP 바인딩 쿠키. 쿠키를 탈취해도 다른 IP에서는 사용 불가 |
| 🔐 소켓 데이터 | HTTPS 환경에서 AES-256-GCM으로 소켓 메시지 암호화 |
| ✅ 입력 검증 | guildId, URL, index, seconds 등 모든 파라미터를 서버에서 검증 |
| 🚫 Rate Limit | 소켓 명령 30회/10초 제한, 로그인 10회 실패 시 15분 잠금 |
| 📦 코드 보호 | JS/HTML 자동 minify (terser + html-minifier-terser) |

---

## 🔧 환경변수

설정 마법사가 알아서 물어보지만, 직접 설정하고 싶다면:

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DISCORD_TOKEN` | (필수) | 봇 토큰 |
| `APPLICATION_ID` | (필수) | 앱 ID |
| `GUILD_ID` | (필수) | 서버 ID |
| `WEB_PORT` | `3000` | Web UI 포트 |
| `WEB_UI_URL` | `http://localhost:{포트}` | 외부에서 접속하는 URL. 리버스 프록시 등으로 외부에 노출할 경우 |
| `WEB_PASSWORD` | | Web UI 비밀번호. 비워두면 누구나 접근 가능 |
| `NAMBI_DIR` | `~/.nambi` | 대기열, 로그 등 데이터 저장 경로 |
| `YT_DLP_BIN` | PATH에서 탐색 | yt-dlp 바이너리 경로 |
| `FFMPEG_BIN` | PATH에서 탐색 | ffmpeg 바이너리 경로 |
| `DEVELOPE_PREFIX` | | `ON`으로 설정하면 `/dev-music`, `/dev-version`으로 등록됨 |

---

## 💾 데이터 저장

모든 데이터는 `~/.nambi/` 아래에 저장됨. Docker에서는 호스트의 이 경로를 컨테이너에 자동 마운트.

```
~/.nambi/
├── queue-state.json      # 대기열, 히스토리 (서버별)
├── logs.jsonl            # 시스템 로그 (최대 2,000줄, 자동 정리)
├── .env.enc              # AES-256-GCM 암호화된 설정
├── .passphrase           # 암호화 패스프레이즈 (자동 생성)
├── .commands-deployed    # 슬래시 명령어 등록 완료 플래그
├── nambibot.pid          # PID 파일 (Baremetal)
└── nambibot.log          # 로그 파일 (Baremetal)
```

---

## 🛠️ 유지보수 스크립트

`scripts/` 디렉토리에 편의 스크립트가 들어있음.

| 스크립트 | 용도 |
|----------|------|
| `docker-run.sh` | 이미지 빌드 + 컨테이너 실행 (Podman/nerdctl 자동 감지) |
| `baremetal-run.sh` | 호스트에서 직접 백그라운드 실행 |
| `systemd-setup.sh` | systemd 사용자 서비스로 등록 (재부팅 후 자동 시작) |
| `stop.sh` | 실행 중인 봇 중지 (Docker/systemd/프로세스 자동 감지) |
| `reconfigure.sh` | 설정 초기화 후 다시 입력 |
| `reset.sh` | 설정, 데이터, 컨테이너 전부 삭제 |
| `show-password.sh` | 현재 설정된 Web UI 비밀번호 확인 |

설정을 바꿔야 할 때: `./scripts/reconfigure.sh` 실행 후 `./scripts/docker-run.sh`로 재배포.

---
