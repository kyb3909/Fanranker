/**
 * 일정 동기화는 일정·배당만 소유한다. status/result/score 키는 아예 보내지 않는다.
 * PostgREST merge upsert는 보낸 컬럼만 갱신하며, 새 행의 status는 DB 기본값을 쓴다.
 * 기존 상태를 읽어 다시 쓰는 방식은 그 사이 도착한 결과와 경합하므로 사용하지 않는다.
 */
export function toScheduleRow(roundId: string, g: Record<string, unknown>) {
  return {
    round_id: roundId,
    game_no: Number(g.game_no) || 0,
    match_time: g.match_time != null ? String(g.match_time) : null,
    sport: g.sport != null ? String(g.sport) : "축구",
    game_type: g.game_type != null ? String(g.game_type) : "일반",
    home_team_name: g.home_team_name != null ? String(g.home_team_name) : "",
    away_team_name: g.away_team_name != null ? String(g.away_team_name) : "",
    league_code: g.league_code != null ? String(g.league_code) : null,
    venue: g.venue != null ? String(g.venue) : null,
    handicap: g.handicap != null ? Number(g.handicap) : null,
    over_under_line: g.over_under_line != null ? Number(g.over_under_line) : null,
    home_win_odds: g.home_win_odds != null ? Number(g.home_win_odds) : null,
    away_win_odds: g.away_win_odds != null ? Number(g.away_win_odds) : null,
    draw_odds: g.draw_odds != null ? Number(g.draw_odds) : null,
    over_odds: g.over_odds != null ? Number(g.over_odds) : null,
    under_odds: g.under_odds != null ? Number(g.under_odds) : null,
    odd_odds: g.odd_odds != null ? Number(g.odd_odds) : null,
    even_odds: g.even_odds != null ? Number(g.even_odds) : null,
  }
}
