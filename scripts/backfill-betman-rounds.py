#!/usr/bin/env python3
"""
Betman 옛 회차 데이터 backfill — DB 에 없는 라운드를 winrstDetl 응답에서 받아 채움.

옛 회차는 베팅 윈도우가 끝나서 gameInfoInq (배당) 응답이 없을 수 있고,
winrstDetl (결과) 응답만 가능. 따라서 odds 컬럼은 모두 NULL 로 들어감.

신규 마켓 (HANDI_VAL=21/23/27, 전반전, 승1패 등) 은 SKIP — Track B 에서 별도 처리.

⚠️ Vultr (한국 IP) 에서만 실행 가능.

사용법:
  python scripts/backfill-betman-rounds.py 260017 260016 260015
  python scripts/backfill-betman-rounds.py --range 260005-260017
  python scripts/backfill-betman-rounds.py --range 260005-260017 --dry-run
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

BETMAN = "https://www.betman.co.kr"
GM_ID = "G101"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# Track A 와 동일 매핑 — 신규 마켓은 SKIP
LEGACY_HANDI_MAP = {
    0: "일반",
    14: "일반",
    2: "핸디캡",
    12: "핸디캡",  # 옛 회차에 등장 (sync.sh betTypId 매핑과 일치)
    9: "언더오버",
    5: "SUM",
    6: "S핸디캡",
    7: "S언더오버",
}
SKIP_HANDI = {21, 23, 27}  # 신규 마켓 — Track B 에서 처리

SPORT_PREFIX = {
    "축구": "축구",
    "야구": "야구",
    "농구": "농구",
    "배구": "배구",
}

# 옛 회차 응답의 MCH_SPORT_CD
SPORT_CODE_MAP = {
    "SC": "축구",
    "BS": "야구",
    "BK": "농구",
    "VL": "배구",
}


def sb_url() -> str:
    return os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]


def sb_key() -> str:
    return os.environ["SUPABASE_SERVICE_ROLE_KEY"]


def sb_request(path: str, method: str = "GET", data=None, prefer: str = "") -> tuple:
    h = {"apikey": sb_key(), "Authorization": f"Bearer {sb_key()}"}
    if prefer:
        h["Prefer"] = prefer
    if data is not None:
        h["Content-Type"] = "application/json"
        body = json.dumps(data).encode()
    else:
        body = None
    req = urllib.request.Request(f"{sb_url()}/rest/v1/{path}", data=body, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.read()


def sb_get(path: str) -> list:
    _, body = sb_request(path)
    return json.loads(body)


def fetch_winrst(gm_ts: str) -> list:
    cookie_req = urllib.request.Request(
        f"{BETMAN}/main/mainPage/gamebuy/winrstDetl.do?gmId={GM_ID}&gmTs={gm_ts}",
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
        f"{BETMAN}/gamebuy/winrst/inqWinrstDetlBody.do",
        data=body,
        headers={
            "Content-Type": "application/json;charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": UA,
            "Origin": BETMAN,
            "Referer": f"{BETMAN}/main/mainPage/gamebuy/winrstDetl.do?gmId={GM_ID}&gmTs={gm_ts}",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read())
    return d.get("detlBody") or []


def parse_score(s):
    if not s or ":" not in s:
        return None
    try:
        h, a = s.split(":")
        return int(h), int(a)
    except (ValueError, TypeError):
        return None


def parse_match_time(fix_mch_dtm):
    """'20260501084000' (KST) → ISO 8601 with +09:00"""
    if not fix_mch_dtm or not re.fullmatch(r"\d{14}", fix_mch_dtm):
        return None
    s = fix_mch_dtm
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}T{s[8:10]}:{s[10:12]}:{s[12:14]}+09:00"


def map_result(handi_val, game_result):
    gt = LEGACY_HANDI_MAP.get(handi_val)
    if gt is None:
        return ""
    gr = str(game_result) if game_result is not None else ""
    if gr == "4":
        return "cancelled"
    if gt in ("일반", "핸디캡", "S핸디캡"):
        return {"0": "home", "1": "draw", "2": "away"}.get(gr, "")
    if gt in ("언더오버", "S언더오버"):
        return {"0": "under", "2": "over"}.get(gr, "")
    if gt == "SUM":
        return {"0": "odd", "2": "even"}.get(gr, "")
    return ""


def detect_sport(it):
    """옛 회차: MCH_SPORT_CD 우선. 신규 회차: BETTYP_NM 첫 단어."""
    code = it.get("MCH_SPORT_CD")
    if code and code in SPORT_CODE_MAP:
        return SPORT_CODE_MAP[code]
    nm = it.get("BETTYP_NM") or ""
    parts = nm.split()
    if parts and parts[0] in SPORT_PREFIX:
        return SPORT_PREFIX[parts[0]]
    return None


def is_first_half(bettyp_nm):
    return "전반" in (bettyp_nm or "")


def build_score_map(items):
    """풀타임 일반(0/14) row 에서 score map. BETTYP_NM null 인 옛 회차에서도 동작."""
    m = {}
    for it in items:
        hv = it.get("HANDI_VAL", 0)
        nm = it.get("BETTYP_NM") or ""
        if hv not in (0, 14):
            continue
        if is_first_half(nm):
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


def parse_league_code(it):
    """LEAG_CD_NM='SC159:A리그' → 'SC159', 또는 GM_LEAG_CD."""
    raw = it.get("LEAG_CD_NM") or ""
    if ":" in raw:
        return raw.split(":")[0]
    return it.get("GM_LEAG_CD") or None


def build_game_row(it, round_id, score_map):
    hv = it.get("HANDI_VAL", 0)
    nm = it.get("BETTYP_NM") or ""

    if hv in SKIP_HANDI:
        return None, "skip_new_market"
    if is_first_half(nm):
        return None, "skip_first_half"
    if "승1패" in nm or "승5패" in nm or "소수핸디캡" in nm:
        return None, "skip_new_market"

    gt = LEGACY_HANDI_MAP.get(hv)
    if gt is None:
        return None, f"skip_unknown_handi_{hv}"

    sport = detect_sport(it)
    if not sport:
        return None, "skip_unknown_sport"

    gm_seq = it.get("GM_SEQ")
    if not gm_seq:
        return None, "skip_no_game_no"

    gr = it.get("GAME_RESULT")
    res = map_result(hv, gr)
    status = "cancelled" if str(gr) == "4" else ("completed" if res else "scheduled")

    if gt == "일반":
        sc = parse_score(it.get("MCH_SCORE"))
    else:
        key = (
            (it.get("HOME_TEAM") or "").strip(),
            (it.get("AWAY_TEAM") or "").strip(),
            it.get("FIX_MCH_DTM"),
        )
        sc = score_map.get(key)

    # 옛 회차 응답의 odds 보존 (신규 회차는 odds 없으니 None)
    odds_w = it.get("ODDS_WIN")
    odds_d = it.get("ODDS_DRAW")
    odds_l = it.get("ODDS_LOSE")
    win_handi = it.get("WIN_HANDI")

    home_win = draw = away_win = None
    over = under = None
    odd_o = even_o = None
    handicap = None
    over_under_line = None

    if gt in ("일반", "핸디캡", "S핸디캡"):
        home_win = odds_w if odds_w not in (None, 0) else None
        draw = odds_d if odds_d not in (None, 0) else None
        away_win = odds_l if odds_l not in (None, 0) else None
        if gt == "핸디캡" and win_handi is not None:
            handicap = win_handi
    elif gt in ("언더오버", "S언더오버"):
        under = odds_w if odds_w not in (None, 0) else None
        over = odds_l if odds_l not in (None, 0) else None
        if win_handi is not None:
            over_under_line = win_handi
    elif gt == "SUM":
        odd_o = odds_w if odds_w not in (None, 0) else None
        even_o = odds_l if odds_l not in (None, 0) else None

    return {
        "round_id": round_id,
        "game_no": gm_seq,
        "sport": sport,
        "game_type": gt,
        "home_team_name": (it.get("HOME_TEAM") or "").strip(),
        "away_team_name": (it.get("AWAY_TEAM") or "").strip(),
        "match_time": parse_match_time(it.get("FIX_MCH_DTM")),
        "status": status,
        "result": res or None,
        "home_score": sc[0] if sc else None,
        "away_score": sc[1] if sc else None,
        "league_code": parse_league_code(it),
        "venue": None,
        "handicap": handicap,
        "over_under_line": over_under_line,
        "home_win_odds": home_win,
        "draw_odds": draw,
        "away_win_odds": away_win,
        "over_odds": over,
        "under_odds": under,
        "odd_odds": odd_o,
        "even_odds": even_o,
    }, "ok"


def ensure_round(gm_ts: str, dry_run: bool) -> str:
    rows = sb_get(f"betman_rounds?select=id&gm_ts=eq.{gm_ts}")
    if rows:
        return rows[0]["id"]
    if dry_run:
        return "DRY_RUN_NEW_ROUND"
    # gm_ts 첫 2자리가 연도 코드 (예: "260017" → 26 → 2026)
    year = 2000 + int(gm_ts[:2]) if len(gm_ts) >= 6 else 2026
    new_round = {
        "gm_ts": gm_ts,
        "year": year,
        "round": int(gm_ts),
        "status": "settled",
        "deadline": "backfill (옛 회차)",
    }
    _, body = sb_request(
        "betman_rounds",
        method="POST",
        data=new_round,
        prefer="return=representation",
    )
    return json.loads(body)[0]["id"]


def backfill_round(gm_ts: str, dry_run: bool, insert_only: bool = False) -> dict:
    items = fetch_winrst(gm_ts)
    if not items:
        return {"gm_ts": gm_ts, "skipped": "no_betman_response"}

    round_id = ensure_round(gm_ts, dry_run)
    score_map = build_score_map(items)

    rows = []
    skip_counts = {}
    for it in items:
        row, status = build_game_row(it, round_id, score_map)
        if row:
            rows.append(row)
        else:
            skip_counts[status] = skip_counts.get(status, 0) + 1

    if not rows:
        return {
            "gm_ts": gm_ts,
            "round_id": round_id,
            "betman_rows": len(items),
            "inserted": 0,
            "skip_counts": skip_counts,
            "note": "all_skipped",
        }

    # betman 응답에 (GM_SEQ, HANDI_VAL, WIN_HANDI) 까지 같은 중복 row 가 종종 옴.
    # (round_id, game_no) unique constraint 충돌 회피용으로 첫 row 만 유지.
    seen = set()
    deduped = []
    dup_count = 0
    for r in rows:
        key = (r["round_id"], r["game_no"])
        if key in seen:
            dup_count += 1
            continue
        seen.add(key)
        deduped.append(r)
    rows = deduped
    if dup_count:
        skip_counts["duplicate_game_no"] = dup_count

    if dry_run:
        return {
            "gm_ts": gm_ts,
            "round_id": round_id,
            "betman_rows": len(items),
            "would_insert": len(rows),
            "skip_counts": skip_counts,
            "sample_rows": rows[:3],
        }

    # 100 단위 chunk upsert. insert_only=True 면 충돌 row 는 skip (덮어쓰기 X)
    resolution = "ignore-duplicates" if insert_only else "merge-duplicates"
    prefer = f"resolution={resolution},return=representation"
    inserted = 0
    chunk_size = 100
    chunk_errors = []
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        try:
            _, body = sb_request(
                "betman_games?on_conflict=round_id,game_no",
                method="POST",
                data=chunk,
                prefer=prefer,
            )
            inserted += len(json.loads(body))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")[:500]
            chunk_errors.append(f"chunk[{i}:{i+chunk_size}] HTTP {e.code}: {err_body}")
        except Exception as e:
            chunk_errors.append(f"chunk[{i}:{i+chunk_size}] {type(e).__name__}: {e}")

    return {
        "gm_ts": gm_ts,
        "round_id": round_id,
        "betman_rows": len(items),
        "inserted": inserted,
        "skip_counts": skip_counts,
        "chunk_errors": chunk_errors,
    }


def parse_range(s: str):
    m = re.fullmatch(r"(\d+)-(\d+)", s)
    if not m:
        raise ValueError(f"잘못된 range 형식: {s}")
    a, b = int(m.group(1)), int(m.group(2))
    if a > b:
        a, b = b, a
    return [str(x) for x in range(a, b + 1)]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("gm_ts", nargs="*", help="개별 gm_ts list")
    ap.add_argument("--range", help="ex: 260005-260017")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--insert-only", action="store_true", help="이미 있는 row 는 덮어쓰지 않음")
    ap.add_argument("--sleep", type=float, default=1.0)
    args = ap.parse_args()

    targets = []
    if args.range:
        targets.extend(parse_range(args.range))
    targets.extend(args.gm_ts)
    if not targets:
        ap.error("gm_ts 또는 --range 필요")

    print(f"[backfill] {len(targets)}개 회차, dry_run={args.dry_run}", file=sys.stderr)

    results = []
    for gmts in targets:
        print(f"  gm_ts={gmts} ...", file=sys.stderr, end=" ", flush=True)
        try:
            r = backfill_round(gmts, args.dry_run, args.insert_only)
            results.append(r)
            if "skipped" in r:
                print(f"SKIP ({r['skipped']})", file=sys.stderr)
            elif args.dry_run:
                print(
                    f"would_insert={r.get('would_insert')} skip={r.get('skip_counts')}",
                    file=sys.stderr,
                )
            else:
                print(
                    f"inserted={r.get('inserted')} skip={r.get('skip_counts')}",
                    file=sys.stderr,
                )
        except Exception as e:
            print(f"FAIL: {e}", file=sys.stderr)
            results.append({"gm_ts": gmts, "error": str(e)})
        time.sleep(args.sleep)

    sys.stdout.write(json.dumps({"dry_run": args.dry_run, "results": results}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
