'use client'

import { Suspense } from 'react'
import Layout from '@/components/Layout'
import EquipmentPassportWorkspace from '@/components/passports/EquipmentPassportWorkspace'

function PassportsPageContent() {
  return (
    <Layout fullWidth>
      <EquipmentPassportWorkspace />
    </Layout>
  )
}

export default function PassportsPage() {
  return (
    <Suspense fallback={null}>
      <PassportsPageContent />
    </Suspense>
  )
}
