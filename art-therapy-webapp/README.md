# 미술치료 일지 및 사진대장 웹앱

Google Apps Script 웹앱 전용 버전입니다. `Index.html`은 로컬에서 직접 열어도 화면 미리보기가 됩니다.

## 구성

- `Code.gs`: Google Drive, Google Sheets, PDF 생성 서버 코드
- `Index.html`: 화면, 스타일, 클라이언트 동작
- `appsscript.json`: Apps Script 권한 설정

## 설치

1. Google Apps Script에서 새 프로젝트를 만듭니다.
2. `Code.gs`, `Index.html`, `appsscript.json`을 같은 이름으로 넣습니다.
3. 프로젝트 설정에서 `appsscript.json 매니페스트 파일 표시`를 켠 뒤 매니페스트를 교체합니다.
4. `배포 > 새 배포 > 웹 앱`으로 배포합니다.
5. 최초 실행 시 Drive/Sheets 권한을 승인합니다.

## 저장 구조

첫 실행 시 Google Drive에 `미술치료 일지 웹앱` 폴더가 생성됩니다.

- Google Sheets: 일지 데이터와 자동완성 목록
- `원본사진`: 촬영/업로드 사진
- `PDF`: 일지 PDF, 사진대장 PDF, 제출용 PDF

## 주요 기능

- 제목, 장소, 프로그램명, 미술치료사, 매체, 참석자 자동완성
- 매체 추가/삭제
- 참석자 시간-성명 행 추가/삭제
- 회기내용 성명-내용 행 추가/삭제
- 사진찍기, 사진 불러오기, 여러 장 등록
- 저장 시 일지 PDF와 2x2 사진대장 PDF 생성
- 제출용 PDF 생성
- 데이터, PDF, 원본사진 구분 삭제
