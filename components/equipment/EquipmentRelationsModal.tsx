'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { canMutateData } from '@/utils/roles'
import ViolationsTable from '@/components/violations/ViolationsTable'
import ViolationForm from '@/components/violations/ViolationForm'
import InspectionsTable from '@/components/inspections/InspectionsTable'
import InspectionWizard from '@/components/inspections/InspectionWizard'
import TasksTable from '@/components/tasks/TasksTable'

export type EquipmentRelationTab = 'violations' | 'inspections' | 'tasks'

interface EquipmentRelationsModalProps {
  equipmentId: number
  initialTab: EquipmentRelationTab
  onClose: () => void
}

const tabs: Array<{ key: EquipmentRelationTab; label: string }> = [
  { key: 'violations', label: 'Нарушения' },
  { key: 'inspections', label: 'Осмотры' },
  { key: 'tasks', label: 'Задачи' },
]

export default function EquipmentRelationsModal({ equipmentId, initialTab, onClose }: EquipmentRelationsModalProps) {
  const { user } = useAuthStore()
  const canMutate = canMutateData(user)
  const [activeTab, setActiveTab] = useState<EquipmentRelationTab>(initialTab)
  const [refreshKey, setRefreshKey] = useState(0)

  const [showViolationForm, setShowViolationForm] = useState(false)
  const [selectedViolationId, setSelectedViolationId] = useState<number | null>(null)

  const [showInspectionWizard, setShowInspectionWizard] = useState(false)
  const [selectedInspectionId, setSelectedInspectionId] = useState<number | null>(null)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab, equipmentId])

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1)

  const openCreateForm = () => {
    if (!canMutate) return
    if (activeTab === 'violations') {
      setSelectedViolationId(null)
      setShowViolationForm(true)
      return
    }
    if (activeTab === 'inspections') {
      setSelectedInspectionId(null)
      setShowInspectionWizard(true)
      return
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/55 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[1400px] max-h-[92vh] overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Связанные данные оборудования #{equipmentId}</h2>
              <p className="text-sm text-slate-500">Переключайтесь между вкладками без выхода из модального окна.</p>
            </div>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Закрыть
            </button>
          </div>

          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}

            {canMutate && (activeTab === 'violations' || activeTab === 'inspections') && (
              <button
                onClick={openCreateForm}
                className="ml-auto inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold border border-primary-200 text-primary-700 bg-primary-50 hover:bg-primary-100"
              >
                {activeTab === 'violations' && 'Создать нарушение'}
                {activeTab === 'inspections' && 'Начать осмотр'}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
            {activeTab === 'violations' && (
              <ViolationsTable
                key={`violations-${equipmentId}-${refreshKey}`}
                onEdit={(id) => {
                  if (!canMutate) return
                  setSelectedViolationId(id)
                  setShowViolationForm(true)
                }}
                onView={(id) => {
                  setSelectedViolationId(id)
                  setShowViolationForm(true)
                }}
                equipmentFilterId={equipmentId}
                refreshKey={refreshKey}
              />
            )}

            {activeTab === 'inspections' && (
              <InspectionsTable
                key={`inspections-${equipmentId}-${refreshKey}`}
                onView={(id) => {
                  setSelectedInspectionId(id)
                  setShowInspectionWizard(true)
                }}
                equipmentFilterId={equipmentId}
              />
            )}

            {activeTab === 'tasks' && (
              <TasksTable
                key={`tasks-${equipmentId}-${refreshKey}`}
                equipmentFilterId={equipmentId}
                refreshKey={refreshKey}
              />
            )}
          </div>
        </div>
      </div>

      {showViolationForm && (
        <ViolationForm
          violationId={selectedViolationId}
          initialEquipmentId={equipmentId}
          onClose={() => {
            setShowViolationForm(false)
            setSelectedViolationId(null)
          }}
          onSuccess={() => {
            setShowViolationForm(false)
            setSelectedViolationId(null)
            triggerRefresh()
          }}
        />
      )}

      {showInspectionWizard && (
        <InspectionWizard
          inspectionId={selectedInspectionId}
          initialEquipmentId={equipmentId}
          onClose={() => {
            setShowInspectionWizard(false)
            setSelectedInspectionId(null)
          }}
          onSuccess={() => {
            setShowInspectionWizard(false)
            setSelectedInspectionId(null)
            triggerRefresh()
          }}
        />
      )}

    </>
  )
}

