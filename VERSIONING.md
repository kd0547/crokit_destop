# 버전 관리 규칙

## 1. 버전 번호

`MAJOR.MINOR.PATCH` 형식 (예: 2.1.4)

| 자리 | 올리는 경우 | 예 |
|---|---|---|
| MAJOR | 기존 데이터·설정을 그대로 쓸 수 없는 변경, 앱 구조를 크게 바꾸는 변경 | 2.1.4 → 3.0.0 |
| MINOR | 새 기능 추가, 기존 기능의 구조·동작 변경 (예: GIF 재생 방식 교체, 화면 배치 변경) | 2.1.4 → 2.2.0 |
| PATCH | 버그 수정, 작은 개선, 문구 수정 | 2.1.4 → 2.1.5 |

- 윗자리를 올리면 아랫자리는 0으로 되돌림
- 버전의 기준은 `package.json`의 `version` 하나
- 변경 명령: `npm version X.Y.Z --no-git-tag-version` (`package-lock.json`도 함께 바뀜)

## 2. 브랜치

| 브랜치 | 용도 |
|---|---|
| `main` | 배포된 상태만 유지. 직접 커밋하지 않음 |
| `feature/<이름>` | 새 기능 작업 (예: `feature/gif-decoder`) |
| `fix/<이름>` | 버그 수정 (예: `fix/empty-folder-path`) |
| `release/X.Y.Z` | 버전 확정용. 버전 변경과 패치 노트만 커밋 |

- 작업 브랜치는 `main`에서 만들고, 끝나면 `release/X.Y.Z`에 모은 뒤 `main`으로 병합
- `main` 병합은 fast-forward만 허용 (`git merge --ff-only`)
- 병합이 끝난 작업 브랜치는 삭제

## 3. 태그

- 형식: `vX.Y.Z` (예: `v2.1.4`)
- 주석 태그(annotated)로 만들고, 메시지에 해당 버전의 패치 노트를 넣음
- `#`으로 시작하는 머리말이 지워지지 않도록 `--cleanup=verbatim` 사용

  ```bash
  git tag -a vX.Y.Z --cleanup=verbatim -F <패치노트 파일>
  ```

- 원격에 올린 태그는 옮기거나 다시 만들지 않음. 잘못되면 다음 PATCH 버전으로 바로잡음

## 4. 패치 노트 (`CHANGELOG.md`)

- 최신 버전을 맨 위에 추가
- 머리말: `## X.Y.Z (YYYY-MM-DD)`
- 분류는 세 가지
  - **추가**: 새 기능
  - **개선**: 기존 기능을 더 좋게 만든 것, 버그 수정
  - **변경**: 동작·위치·표시 방식이 바뀐 것
- 문체
  - 간결한 명사형으로 작성, "~요"·"~습니다" 체는 쓰지 않음
  - 형식: `- 기능 이름: 설명`
- 사용자에게 보이는 변화만 작성
  - 내부 작업(테스트, 코드 정리, 개발 도구, 라이브러리 업데이트)은 커밋 메시지에만 기록

## 5. 커밋 메시지

- 영어, 명령형 제목 한 줄 (예: `Add favorite and hide toggles to library photos`)
- 필요하면 빈 줄 다음에 본문으로 이유와 영향 설명
- 버전 확정 커밋의 제목은 `Release X.Y.Z`

## 6. 릴리스 순서

1. `main`에서 `release/X.Y.Z` 브랜치 생성, 작업 브랜치 병합
2. 확인
   - 백엔드 테스트: `python/`에서 `.venv\Scripts\python -m unittest discover -s tests`
   - 화면 빌드: `npm run build`
   - 앱을 실행해 바뀐 기능 직접 확인
3. 버전 변경: `npm version X.Y.Z --no-git-tag-version`
4. `CHANGELOG.md`에 패치 노트 작성
5. 커밋: `Release X.Y.Z`
6. 태그 생성: `vX.Y.Z`
7. `main`에 fast-forward 병합
8. push: `git push origin main` → `git push origin vX.Y.Z`
9. 설치 파일 빌드: `npm run dist` → `release/crokit Setup X.Y.Z.exe`
10. GitHub Releases에 태그 기준으로 릴리스를 만들고 설치 파일과 패치 노트 첨부

## 7. 버전을 올릴 때 함께 지킬 것

- **DB 변경**: 기존 사용자의 데이터가 유지되도록 `python/app/db.py`에 마이그레이션 추가
  - 마이그레이션 없이 기존 데이터를 쓸 수 없게 되면 MAJOR
- **화면 문구**: 새 문구는 `src/i18n`의 4개 언어 사전에 모두 추가 (빠지면 빌드 실패)
- **설치 파일**: 반드시 버전을 올린 뒤에 빌드 (파일 이름과 exe 정보에 버전이 들어감)
