# 미술치료 일지 및 사진대장

기존 사진대장 앱처럼 GitHub Pages를 실제 앱 주소로 쓰고, Google Apps Script/Drive/Sheets는 DB와 파일 저장 API로만 쓰는 구조입니다.

## 구조

- `index.html`: GitHub Pages에서 열리는 실제 앱 화면
- `apps-script-api/Code.gs`: Google Apps Script API 코드

## 사용 주소

GitHub Pages를 켜면 앱 주소는 다음 형태입니다.

`https://mijo1687-del.github.io/art-therapy-qnwls/`

## Apps Script 적용

Google Apps Script 프로젝트의 `Code.gs`에는 `apps-script-api/Code.gs` 내용을 붙여넣고 웹앱으로 배포합니다.

배포 URL이 바뀌면 `index.html`의 `API_URL` 값을 새 `/exec` 주소로 바꿉니다.
