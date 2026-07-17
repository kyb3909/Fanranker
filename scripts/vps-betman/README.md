# VPS Betman 운영 스크립트 (백업)

betman.co.kr 크롤은 한국 IP가 필요해서 **Vultr 서울 VPS**에서만 동작한다 (Vercel은 해외 IP라 접근 불가). 아래 4개 bash 스크립트가 VPS `/opt/betman/`에서 cron으로 실제 운영되며, 이 폴더는 그 **백업 복사본**이다.

> ⚠️ **여기가 원본이 아니다.** 실 운영본은 VPS `/opt/betman/*.sh`. 이 폴더는 서버 재구축/유실 대비 스냅샷일 뿐이며, 자동 동기화되지 않는다. VPS에서 스크립트를 수정하면 여기도 갱신해줘야 한다 (`python scripts/vultr-exec.py "cat /opt/betman/<f>" > scripts/vps-betman/<f>`).

## 스크립트 (스크립트명 ≠ 로그 파일명 — tail 시 주의)

| 스크립트 | 로그 | 주기 | 역할 |
|---|---|---|---|
| `sync.sh` | `sync.log` | 매시간 :10 | 게임 데이터 수집 |
| `fetch-results.sh` | `results.log` | 15분마다 | 결과 수집 + 정산 |
| `monitor.sh` | `monitor.log` | 30분마다 | betman 상태 헬스 체크 (동기화 안 함) |
| `integrity-check.sh` | `cron.log` | 4시간마다 | 무결성 검사 |

## 시크릿

스크립트는 `source /opt/betman/.env`로 자격증명을 외부에서 읽는다. **하드코딩된 키 없음** → `.env`는 백업에 포함하지 않는다 (VPS에만 존재).

## 스냅샷 시점

- 2026-07-18 최초 백업.
- `fetch-results.sh` line 280: `FIX_MCH_DTM`(압축 `YYYYMMDDHHMMSS`) → ISO 재포맷 fix 포함 (`betman_unknown_games.match_time` 캐스팅 에러 해결).

## 접속 / 디버깅

- SSH: `ssh root@<Vultr IP>` (비번은 Vultr 대시보드).
- 자동 실행: `python scripts/vultr-exec.py "<명령>"` (`.env`의 `VULTR_*` 자격증명, read-only 자율 / 수정은 확인).
- 로그: `tail -20 /opt/betman/sync.log` 등.
- 수동 실행: `bash /opt/betman/<script>; echo "종료: $?"`.
