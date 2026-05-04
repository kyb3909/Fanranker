#!/usr/bin/env python3
"""
Betman 결과 무결성 감사 — DB ↔ betman 정답 1:1 비교

킬러 컨텐츠인 베팅/예측의 정산 정확도를 보장하기 위한 회귀 검증 도구.
DB 의 betman_games 와 betman 의 winrstDetl 응답을 game_no 단위로 비교해
(result, home_score, away_score) 에 불일치가 있는지 dump.

사용법:
  python scripts/audit-betman-results.py                 # 최근 5 라운드
  python scripts/audit-betman-results.py --rounds 30     # 최근 30 라운드
  python scripts/audit-betman-results.py --gm-ts 260050,260049
  python scripts/audit-betman-results.py --all           # 모든 라운드 (전수)
  python scripts/audit-betman-results.py --output report.json

⚠️ Vultr (한국 IP) 에서 실행. Vercel/로컬은 betman.co.kr 차단.

환경변수 (Vultr /opt/betman/.env 에 이미 있음):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Optional

# 신 체계 매핑 (Track A 2026-05-04 적용 후) + 옛 체계 매핑 (개편 전 코드)
# 옛 체계 (BETTYP_NM=null, MCH_SPORT_CD 사용) — 2026-05 식별:
#   12=축구 소수핸디캡(2-way), 13=야구 승1패(3-way), 16=야구 승무패(3-way, deprecated),
#   18=야구 핸디캡(2-way), 19=야구 언더오버
HANDI_TYPE_MAP = {
    0: "일반",
    14: "일반",
    2: "핸디캡",
    9: "언더오버",
    5: "SUM",
    6: "S핸디캡",
    7: "S언더오버",
    21: "승패2way",
    23: "핸디캡",
    27: "SUM",
    # 옛 체계 — MCH_SCORE 가 핸디 적용된 row 는 "핸디캡"/"언더오버" 로 매핑
    # (자체 MCH_SCORE 를 home/away score 로 쓰지 않고 score_map fallback 사용)
    12: "핸디캡",  # 축구 소수핸디캡 — 핸디 적용 점수, 무승부는 GAME_RESULT 에 안 옴
    13: "일반",  # 야구 승1패 — MCH_SCORE 가 실제 점수, 1점차 무승부 가능
    16: "일반",  # 야구 승무패 — MCH_SCORE 가 실제 점수, 실제 무승부 (KBO/NPB)
    18: "핸디캡",  # 야구 핸디캡 — 핸디 적용 점수
    19: "언더오버",  # 야구 언더오버 — 토탈 형식
}

BETMAN_BASE = "https://www.betman.co.kr"
GM_ID = "G101"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def sb_url() -> str:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    if not url:
        print("SUPABASE_URL 누락", file=sys.stderr)
        sys.exit(2)
    return url


def sb_key() -> str:
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        print("SUPABASE_SERVICE_ROLE_KEY 누락", file=sys.stderr)
        sys.exit(2)
    return key


def supabase_get(path: str) -> list:
    req = urllib.request.Request(
        f"{sb_url()}/rest/v1/{path}",
        headers={"apikey": sb_key(), "Authorization": f"Bearer {sb_key()}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def supabase_patch(path: str, data: dict) -> None:
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{sb_url()}/rest/v1/{path}",
        data=body,
        headers={
            "apikey": sb_key(),
            "Authorization": f"Bearer {sb_key()}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="PATCH",
    )
    try:
        urllib.request.urlopen(req, timeout=15).read()
    except urllib.error.HTTPError as e:
        raise Exception(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:200]}")


def fetch_winrst(gm_ts: str) -> list:
    """betman winrstDetl 응답의 detlBody 배열 반환."""
    cookie_req = urllib.request.Request(
        f"{BETMAN_BASE}/main/mainPage/gamebuy/winrstDetl.do?gmId={GM_ID}&gmTs={gm_ts}",
        headers={"User-Agent": UA},
    )
    try:
        urllib.request.urlopen(cookie_req, timeout=15).read()
    except Exception:
        pass

    body = json.dumps(
        {"gmId": GM_ID, "gmTs": int(gm_ts), "_sbmInfo": {"_sbmInfo": {"debugMode": "false"}}}
    ).encode()
    req = urllib.request.Request(
        f"{BETMAN_BASE}/gamebuy/winrst/inqWinrstDetlBody.do",
        data=body,
        headers={
            "Content-Type": "application/json;charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": UA,
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "ko-KR,ko;q=0.9",
            "Origin": BETMAN_BASE,
            "Referer": f"{BETMAN_BASE}/main/mainPage/gamebuy/winrstDetl.do?gmId={GM_ID}&gmTs={gm_ts}",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    return data.get("detlBody") or []


def parse_score(s: Optional[str]) -> Optional[tuple]:
    if not s or ":" not in s:
        return None
    try:
        h, a = s.split(":")
        return int(h), int(a)
    except (ValueError, TypeError):
        return None


def expected_result(handi_val: int, game_result) -> str:
    """fetch-results.sh 의 result 매핑 로직 정확 재현."""
    gt = HANDI_TYPE_MAP.get(handi_val)
    gr = str(game_result) if game_result is not None else ""
    if gr == "4":
        return "cancelled"
    if gt in ("일반", "핸디캡", "S핸디캡"):
        return {"0": "home", "1": "draw", "2": "away"}.get(gr, "")
    if gt == "승패2way":
        return {"0": "home", "2": "away"}.get(gr, "")
    if gt in ("언더오버", "S언더오버"):
        return {"0": "under", "2": "over"}.get(gr, "")
    if gt == "SUM":
        return {"0": "odd", "2": "even"}.get(gr, "")
    return ""


def build_score_map(items: list) -> dict:
    """풀타임 점수 소스에서 score map 구축.
    신 체계: HANDI_VAL=0/14/21 + BETTYP_NM '전반' 제외
    옛 체계: HANDI_VAL=13/16 (야구 승1패/승무패 — MCH_SCORE 실제 점수)
    """
    m = {}
    for it in items:
        hv = it.get("HANDI_VAL", 0)
        nm = it.get("BETTYP_NM") or ""
        if hv not in (0, 14, 21, 13, 16):
            continue
        if "전반" in nm:
            continue
        sc = parse_score(it.get("MCH_SCORE"))
        if sc:
            key = (
                (it.get("HOME_TEAM") or "").strip(),
                (it.get("AWAY_TEAM") or "").strip(),
                it.get("FIX_MCH_DTM"),
            )
            m[key] = sc
    return m


def apply_fix(round_id: str, mismatch: dict) -> dict | None:
    """mismatch row 의 result/home_score/away_score 를 betman 답으로 PATCH.
    betman 답이 None/빈문자열인 field 는 스킵 (덮어쓰지 않음)."""
    update = {}
    for diff in mismatch["diffs"]:
        f = diff["field"]
        v = diff["betman"]
        if f == "result" and v:
            update["result"] = v
        elif f in ("home_score", "away_score") and v is not None:
            update[f] = v
    if not update:
        return None
    try:
        supabase_patch(
            f"betman_games?round_id=eq.{round_id}&game_no=eq.{mismatch['game_no']}",
            update,
        )
        return update
    except Exception as e:
        return {"_error": str(e)}


def audit_round(round_id: str, gm_ts: str, auto_fix: bool = False) -> dict:
    db_games = supabase_get(
        f"betman_games?select=game_no,sport,game_type,home_team_name,away_team_name,status,result,home_score,away_score,handicap&round_id=eq.{round_id}"
    )
    db_by_no = {g["game_no"]: g for g in db_games}

    items = fetch_winrst(gm_ts)
    if not items:
        return {
            "gm_ts": gm_ts,
            "round_id": round_id,
            "db_games": len(db_games),
            "betman_rows": 0,
            "skipped": "no betman response",
        }

    score_map = build_score_map(items)

    mismatches = []
    matched = 0
    no_db_row = 0
    unmapped_handi = set()
    seen_gm_seq: set = set()  # 같은 GM_SEQ 다중 핸디 라인 dedup (첫 row 만 비교/fix)

    for it in items:
        gm_seq = it.get("GM_SEQ")
        if gm_seq not in db_by_no:
            no_db_row += 1
            continue
        if gm_seq in seen_gm_seq:
            continue  # 다중 핸디 라인 — 첫 row 와 다른 답일 수 있어 fix 안 함
        seen_gm_seq.add(gm_seq)
        db_g = db_by_no[gm_seq]

        hv = it.get("HANDI_VAL", 0)
        if hv not in HANDI_TYPE_MAP:
            unmapped_handi.add(hv)

        nm = it.get("BETTYP_NM") or ""
        gr = it.get("GAME_RESULT")
        exp_result = expected_result(hv, gr)

        # 점수: 일반/승패2way 는 자체, 나머지는 score_map fallback
        gt = HANDI_TYPE_MAP.get(hv)
        if gt in ("일반", "승패2way"):
            score = parse_score(it.get("MCH_SCORE"))
        else:
            key = (
                (it.get("HOME_TEAM") or "").strip(),
                (it.get("AWAY_TEAM") or "").strip(),
                it.get("FIX_MCH_DTM"),
            )
            score = score_map.get(key)

        exp_home = score[0] if score else None
        exp_away = score[1] if score else None

        actual_result = db_g.get("result")
        actual_home = db_g.get("home_score")
        actual_away = db_g.get("away_score")

        diffs = []
        if exp_result and exp_result != actual_result:
            diffs.append({"field": "result", "db": actual_result, "betman": exp_result})
        if exp_home is not None and exp_home != actual_home:
            diffs.append({"field": "home_score", "db": actual_home, "betman": exp_home})
        if exp_away is not None and exp_away != actual_away:
            diffs.append({"field": "away_score", "db": actual_away, "betman": exp_away})

        if diffs:
            mm_row = {
                "game_no": gm_seq,
                "sport": db_g.get("sport"),
                "game_type": db_g.get("game_type"),
                "match": f"{db_g.get('home_team_name')} vs {db_g.get('away_team_name')}",
                "db_status": db_g.get("status"),
                "betman_HANDI_VAL": hv,
                "betman_BETTYP_NM": nm,
                "betman_GAME_RESULT": gr,
                "betman_MCH_SCORE": it.get("MCH_SCORE"),
                "diffs": diffs,
            }
            if auto_fix:
                mm_row["fix"] = apply_fix(round_id, mm_row)
            mismatches.append(mm_row)
        else:
            matched += 1

    db_unseen = [
        {"game_no": gn, **{k: v for k, v in g.items() if k != "game_no"}}
        for gn, g in db_by_no.items()
        if gn not in {it.get("GM_SEQ") for it in items}
    ]

    return {
        "gm_ts": gm_ts,
        "round_id": round_id,
        "db_games": len(db_games),
        "betman_rows": len(items),
        "matched": matched,
        "mismatch_count": len(mismatches),
        "betman_no_db_row": no_db_row,
        "db_no_betman_row": len(db_unseen),
        "unmapped_HANDI_VAL": sorted(unmapped_handi),
        "mismatches": mismatches[:50],
        "mismatches_truncated": len(mismatches) > 50,
        "db_unseen_sample": db_unseen[:10],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--rounds", type=int, default=5, help="최근 N 라운드")
    ap.add_argument("--gm-ts", help="콤마 구분된 gm_ts list")
    ap.add_argument("--all", action="store_true", help="모든 라운드 (전수)")
    ap.add_argument("--output", help="결과 JSON 저장 경로")
    ap.add_argument("--sleep", type=float, default=0.5, help="라운드 사이 sleep (초)")
    ap.add_argument("--auto-fix", action="store_true", help="매핑된 HANDI_VAL 의 불일치 row 를 betman 답으로 자동 수정")
    args = ap.parse_args()

    if args.gm_ts:
        gmts_list = [s.strip() for s in args.gm_ts.split(",") if s.strip()]
        rounds = supabase_get(f"betman_rounds?select=id,gm_ts&gm_ts=in.({','.join(gmts_list)})&order=gm_ts.desc")
    elif args.all:
        rounds = supabase_get("betman_rounds?select=id,gm_ts&order=gm_ts.desc")
    else:
        rounds = supabase_get(f"betman_rounds?select=id,gm_ts&order=gm_ts.desc&limit={args.rounds}")

    print(f"[audit] 검증 라운드: {len(rounds)}개", file=sys.stderr, flush=True)

    full = []
    total_mismatches = 0
    total_skipped = 0
    for i, r in enumerate(rounds, 1):
        gmts = r["gm_ts"]
        print(f"  [{i}/{len(rounds)}] gm_ts={gmts}", file=sys.stderr, end=" ", flush=True)
        try:
            rep = audit_round(r["id"], gmts, args.auto_fix)
            full.append(rep)
            if rep.get("skipped"):
                print(f"SKIPPED ({rep['skipped']})", file=sys.stderr)
                total_skipped += 1
            else:
                mm = rep["mismatch_count"]
                total_mismatches += mm
                marker = "OK" if mm == 0 else f"DIFF:{mm}"
                print(
                    f"db={rep['db_games']} betman={rep['betman_rows']} matched={rep['matched']} {marker}",
                    file=sys.stderr,
                )
        except Exception as e:
            print(f"FAIL: {e}", file=sys.stderr)
            full.append({"gm_ts": gmts, "error": str(e)})
        time.sleep(args.sleep)

    summary = {
        "total_rounds": len(rounds),
        "total_skipped": total_skipped,
        "total_mismatches": total_mismatches,
        "rounds": full,
    }

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        print(f"[audit] 저장: {args.output}", file=sys.stderr)
    else:
        sys.stdout.write(json.dumps(summary, ensure_ascii=False, indent=2))

    print(
        f"[audit] 완료: 라운드 {len(rounds)}, 스킵 {total_skipped}, 불일치 합계 {total_mismatches}",
        file=sys.stderr,
    )
    return 0 if total_mismatches == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
