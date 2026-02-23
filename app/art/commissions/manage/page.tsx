"use client"

import { useState, useEffect, useCallback } from "react"
import { useUser } from "@clerk/nextjs"
import { CommissionPackageForm } from "@/components/commission/package-form"
import { CommissionPackageCard } from "@/components/commission/package-card"
import { Loader2, Plus, Palette, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface CommissionPackage {
  id: string
  artist_id: string
  name: string
  type: string
  description: string
  features: string[]
  price_gold: number
  delivery_days: number
  max_revisions: number
  max_slots: number
  used_slots: number
  is_active: boolean
}

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

export default function ManagePackagesPage() {
  const { user } = useUser()
  const [packages, setPackages] = useState<CommissionPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const fetchPackages = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch(`/api/commissions/packages?artist_id=${user.id}`)
      const data = await res.json()
      if (res.ok) setPackages(data.packages)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchPackages()
  }, [fetchPackages])

  const handleCreate = async (formData: PackageFormData) => {
    const res = await fetch('/api/commissions/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    setShowForm(false)
    fetchPackages()
  }

  const handleUpdate = async (formData: PackageFormData) => {
    if (!editingId) return
    const res = await fetch(`/api/commissions/packages/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    setEditingId(null)
    fetchPackages()
  }

  const editingPkg = editingId ? packages.find(p => p.id === editingId) : null

  return (
    <main id="main-content" tabIndex={-1} className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/art/commissions" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">패키지 관리</h1>
            <p className="text-sm text-muted-foreground">커미션 패키지를 만들고 관리하세요</p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setShowForm(true); setEditingId(null) }}>
          <Plus className="h-3.5 w-3.5" />
          새 패키지
        </Button>
      </div>

      {/* Create/Edit Form */}
      {(showForm || editingId) && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-sm text-foreground">{editingId ? '패키지 수정' : '새 패키지 만들기'}</h2>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="text-muted-foreground hover:text-foreground text-sm">&times; 닫기</button>
          </div>
          <CommissionPackageForm
            initialData={editingPkg || undefined}
            onSubmit={editingId ? handleUpdate : handleCreate}
            submitLabel={editingId ? '수정 완료' : '패키지 생성'}
          />
        </div>
      )}

      {/* Package List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : packages.length === 0 && !showForm ? (
        <div className="text-center py-20">
          <Palette className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">아직 패키지가 없습니다.</p>
          <Button size="sm" className="mt-3" onClick={() => setShowForm(true)}>
            첫 패키지 만들기
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((pkg) => (
            <div key={pkg.id} className="relative">
              <CommissionPackageCard pkg={pkg} showOrderButton={false} />
              <div className="absolute top-2 right-2 flex gap-1">
                <button
                  onClick={() => { setEditingId(pkg.id); setShowForm(false) }}
                  className="px-2 py-1 bg-card border border-border rounded text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  수정
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
