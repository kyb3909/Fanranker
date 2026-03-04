"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

const TYPES = [
  { value: 'illustration', label: '일러스트' },
  { value: 'character-design', label: '캐릭터 디자인' },
  { value: 'portrait', label: '초상화' },
  { value: 'logo', label: '로고' },
  { value: 'comic-page', label: '만화 페이지' },
  { value: 'animation', label: '애니메이션' },
  { value: 'concept-art', label: '컨셉 아트' },
  { value: 'custom', label: '커스텀' },
]

interface PackageFormData {
  name: string
  type: string
  description: string
  features: string[]
  price_gold: number
  delivery_days: number
  max_revisions: number
  max_slots: number
  is_active: boolean
}

interface Props {
  initialData?: Partial<PackageFormData>
  onSubmit: (data: PackageFormData) => Promise<void>
  submitLabel?: string
}

export function CommissionPackageForm({ initialData, onSubmit, submitLabel = '패키지 생성' }: Props) {
  const [form, setForm] = useState<PackageFormData>({
    name: initialData?.name || '',
    type: initialData?.type || 'illustration',
    description: initialData?.description || '',
    features: initialData?.features || [],
    price_gold: initialData?.price_gold || 500,
    delivery_days: initialData?.delivery_days || 7,
    max_revisions: initialData?.max_revisions ?? 2,
    max_slots: initialData?.max_slots ?? 3,
    is_active: initialData?.is_active ?? true,
  })
  const [featureInput, setFeatureInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.type || form.price_gold <= 0 || form.delivery_days <= 0) {
      setError('필수 항목을 모두 올바르게 입력해주세요.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onSubmit(form)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const addFeature = () => {
    if (featureInput.trim()) {
      setForm({ ...form, features: [...form.features, featureInput.trim()] })
      setFeatureInput('')
    }
  }

  const removeFeature = (idx: number) => {
    setForm({ ...form, features: form.features.filter((_, i) => i !== idx) })
  }

  const inputClass = "w-full h-9 px-3 bg-secondary text-sm text-foreground rounded-lg border border-transparent focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="text-sm text-primary bg-primary/10 border border-primary/30 rounded-lg px-3 py-2">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">패키지 이름 *</label>
          <input className={inputClass} placeholder="예: 캐릭터 풀일러스트" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">유형 *</label>
          <select className={inputClass} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-foreground mb-1 block">설명</label>
        <textarea className={`${inputClass} h-20 py-2`} placeholder="패키지에 대한 설명..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
      </div>

      <div>
        <label className="text-xs font-medium text-foreground mb-1 block">포함 사항</label>
        <div className="flex gap-2 mb-2">
          <input className={`${inputClass} flex-1`} placeholder="예: 고해상도 PNG 파일" value={featureInput} onChange={e => setFeatureInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeature() } }} />
          <Button type="button" size="sm" variant="outline" onClick={addFeature}>추가</Button>
        </div>
        {form.features.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {form.features.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-muted text-xs rounded-md">
                {f}
                <button type="button" onClick={() => removeFeature(i)} className="text-muted-foreground hover:text-foreground">&times;</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">가격 (골드) *</label>
          <input className={inputClass} type="number" min={1} value={form.price_gold} onChange={e => setForm({ ...form, price_gold: parseInt(e.target.value) || 0 })} />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">작업일 *</label>
          <input className={inputClass} type="number" min={1} value={form.delivery_days} onChange={e => setForm({ ...form, delivery_days: parseInt(e.target.value) || 0 })} />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">수정 횟수</label>
          <input className={inputClass} type="number" min={0} value={form.max_revisions} onChange={e => setForm({ ...form, max_revisions: parseInt(e.target.value) || 0 })} />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">최대 슬롯</label>
          <input className={inputClass} type="number" min={1} value={form.max_slots} onChange={e => setForm({ ...form, max_slots: parseInt(e.target.value) || 1 })} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
        <label htmlFor="is_active" className="text-xs text-foreground">패키지 활성화 (공개)</label>
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  )
}
