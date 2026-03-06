'use client'

import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import CraneDefectWorkbench from '@/components/defectovka/CraneDefectWorkbench'

export default function DefectovkaPage() {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout fullWidth>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Дефектовка крана (3D)</h1>
          <p className="text-gray-600 mt-2 font-medium">
            Интерактивная модель для осмотра узлов и быстрого создания нарушений.
          </p>
        </div>

        <CraneDefectWorkbench />
      </div>
    </Layout>
  )
}
