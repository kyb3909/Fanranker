import { z } from "zod"
import { ResearchSchema, SourceSchema } from "@/lib/news/desk/types"

/** Imported articles can acquire research later, but evaluation always needs the actual source. */
export const EvaluationEvidenceSchema = z.object({
  sources: z
    .array(SourceSchema)
    .min(1)
    .max(4)
    .refine(
      (sources) => sources.some((source) => source.role === "current"),
      "비교 평가에는 현재 기사 원문이 필요합니다."
    ),
  research: ResearchSchema.nullable(),
})
