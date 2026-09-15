// Database reviews are authoritative, including rows previously exported by the legacy CLI.
/**
 * @typedef {{id?:string,persona?:string,before:{title:string,paragraphs:string[]},after:{title:string,paragraphs:string[]},note?:string}} CorrectionPair
 * @typedef {{id?:string,source_title:string,reason:string}} Rejection
 * @typedef {{pairs:CorrectionPair[],rejects?:Rejection[]}} Corrections
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {Corrections} base
 */
export async function loadAggCorrections(db, base = { pairs: [], rejects: [] }) {
  const { data, error } = await db
    .from("agg_training_entries")
    .select(
      "id,persona,source_title,ai_title,ai_body,fix_title,fix_body,reject_reason,status,reviewed_at"
    )
    .in("status", ["corrected", "rejected"])
    .order("reviewed_at", { ascending: false })
    .order("id")
    .limit(100)
  if (error) throw Error("커뮤니티 교정 이력을 불러오지 못했습니다.")
  const pairs = [...(base.pairs || [])],
    rejects = [...(base.rejects || [])]
  for (const e of [...(data || [])].reverse()) {
    if (e.status === "corrected" && e.fix_title && e.fix_body) {
      const old = pairs.findIndex((p) => p.before?.title === e.ai_title && p.persona === e.persona)
      if (old >= 0) pairs.splice(old, 1)
      pairs.push({
        id: e.id,
        persona: e.persona,
        before: { title: e.ai_title, paragraphs: (e.ai_body || "").split(/\n\n+/) },
        after: { title: e.fix_title, paragraphs: e.fix_body.split(/\n\n+/) },
        note: "",
      })
    } else if (e.status === "rejected") {
      const old = rejects.findIndex((r) => r.source_title === e.source_title)
      if (old >= 0) rejects.splice(old, 1)
      rejects.push({ id: e.id, source_title: e.source_title, reason: e.reject_reason || "" })
    }
  }
  return { pairs: pairs.slice(-8), rejects: rejects.slice(-8) }
}
