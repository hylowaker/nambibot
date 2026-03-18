# Discord 남비봇

## 의존성

- NodeJS 20 이상 버전 (혹은 Bun)
- yt-dlp
- ffmpeg


## 봇 실행

아래 명령어는 NodeJS 기준.

### 패키지 설치

```shell
npm install
```

### 환경변수 설정

`.env.template` 파일을 참고하여 `.env` 파일을 생성하고 알맞은 값을 설정한다.

### 서버에 명령어 등록

```shell
node deploy-commands.js
```

### 봇 스크립트 실행

```shell
node index.js
```


## systemd 서비스 등록

사용자 서비스로 등록 예시.

```shell
mkdir -p ~/.config/systemd/user/
sudo loginctl enable-linger $USER
```

`nambibot.service` 파일을 참고하여 `~/.config/systemd/user/nambibot.service` 파일 작성.
(예시 Unit 파일에서는 Bun 런타임을 사용한다.)

```shell
systemctl --user daemon-reload
systemctl --user enable --now nambibot
```
