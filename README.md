# crokit (Electron + React + Python)

크로키(드로잉 연습) 레퍼런스 뷰어. 기존 WPF(.NET) 버전을 Electron + React(프론트/윈도우) + Python(FastAPI, 이미지 처리·데이터 저장) 스택으로 새로 작성한 버전입니다.

## 개발 환경 준비

```bash
npm install
npm run python:setup
```

`python:setup`은 `python/.venv`에 가상환경을 만들고 `python/requirements.txt`를 설치합니다.

## 개발 서버 실행

```bash
npm run dev
```

Vite 개발 서버 + Electron(단일 창) + Python(FastAPI, `127.0.0.1:58090`)이 함께 기동됩니다.

## 배포용 빌드

```bash
npm run dist
```

`release/crokit Setup <버전>.exe` (Windows NSIS 인스톨러)가 생성됩니다. 순서는 다음과 같습니다.

1. `npm run python:build` — PyInstaller로 백엔드를 `python/dist/crokit-backend/crokit-backend.exe`로 동결 (`python/run_backend.py`가 진입점, 빌드 도구는 `python/requirements-build.txt`)
2. `npm run build` — 렌더러 + Electron 메인/프리로드 빌드
3. `electron-builder` — 동결된 백엔드를 `resources/backend/`로 포함해 인스톨러 생성

설치된 앱은 `resources/backend/crokit-backend.exe`를 실행하므로 사용자 PC에 Python이 필요 없습니다.

> Windows 개발자 모드가 꺼져 있으면 electron-builder가 `winCodeSign` 압축을 풀다 심볼릭 링크 권한 오류로 실패할 수 있습니다. 이때는 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\` 의 내려받은 `.7z`를 같은 폴더의 `winCodeSign-2.6.0`으로 직접 풀면 됩니다 (실패하는 두 파일은 macOS용이라 무시해도 됨).

## 폴더 구조

- `electron/` — Electron 메인 프로세스 (단일 창 관리, Python 프로세스 기동, 세션 상태머신)
- `src/` — React 렌더러 (탑바 + 사이드바(세션/히스토리) + 스테이지(사진·GIF 스크러버·폴더 브라우저) 단일 화면 UI)
- `python/` — FastAPI 백엔드 (폴더 등록·스캔, GIF 프레임 추출, 설정/히스토리 SQLite 저장)

## 데이터 모델

이미지를 개별적으로 "가져오기" 하지 않고, **폴더를 등록**하면 그 폴더를 그때그때 스캔해 재생 목록을 구성합니다 (`folders` 테이블 + 실시간 디렉터리 스캔). GIF는 재생 시 프레임을 온디맨드로 추출해 `frames/` 아래 캐시합니다. 세션이 끝나면 `session_history` 테이블에 기록되어 히스토리 탭에 표시됩니다.

## 데이터 저장 위치

앱 실행 시 `app.getPath('userData')` 아래(`crokit.db`, `frames/`)에 저장됩니다. 개발 중 독립 실행 시에는 `python/.data/`를 사용합니다.
