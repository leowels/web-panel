'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import Script from 'next/script'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { canMutateData } from '@/utils/roles'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const MODEL_SRC = '/models/mostovye_dvuhbalochnye_krany.glb'
const EMK_KEYWORDS = ['эмк', 'электро мостовой кран', 'электромостовой кран']

type Severity = 'low' | 'medium' | 'high' | 'critical'

type EquipmentItem = {
  id: number
  equipment_type: string
  passport_number: string
}

type DefectNode = {
  id: number
  key: string
  title: string
  description: string
  recommendation?: string | null
  severity: Severity
  position: string
  normal?: string | null
  hotspot_size?: number | null
  sort_order: number
  is_active: boolean
}

type NodeFormState = {
  key: string
  title: string
  description: string
  recommendation: string
  severity: Severity
  position: string
  normal: string
  hotspot_size: string
  sort_order: string
  is_active: boolean
}

type ViolationDraftForm = {
  description: string
  photos: File[]
}

type NodeViolation = {
  id: number
  defect_node_id?: number | null
  description: string
  severity: Severity
  status: string
  created_at: string
  deadline?: string | null
  is_overdue?: boolean | null
}

type NodeViolationStats = {
  total: number
  open: number
  resolved: number
  overdue: number
  maxOpenSeverity: Severity | null
  latest: NodeViolation[]
}

type ModelVectorValue = string | { x: number; y: number; z: number }

type ModelViewerPickResult = {
  position?: ModelVectorValue
  normal?: ModelVectorValue
}

type ModelViewerElement = HTMLElement & {
  positionAndNormalFromPoint?: (x: number, y: number) => ModelViewerPickResult | null
}

const severityLabel: Record<Severity, string> = {
  low: 'Низкая',
  medium: 'Средняя',
  high: 'Высокая',
  critical: 'Критическая',
}

const severityClass: Record<Severity, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-rose-100 text-rose-700',
}

const severityPriority: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

const statusLabel: Record<string, string> = {
  open: 'Открыто',
  resolved: 'Устранено',
  in_progress: 'В работе',
}

const emptyNodeForm = (): NodeFormState => ({
  key: '',
  title: '',
  description: '',
  recommendation: '',
  severity: 'medium',
  position: '',
  normal: '0m 1m 0m',
  hotspot_size: '',
  sort_order: '100',
  is_active: true,
})

const isEmkEquipment = (item: EquipmentItem) => {
  const source = `${item.equipment_type} ${item.passport_number}`.toLowerCase()
  return EMK_KEYWORDS.some((keyword) => source.includes(keyword))
}

const toNumberOrNull = (value: string): number | null => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const formatVector = (value: { x: number; y: number; z: number }) =>
  `${value.x.toFixed(3)}m ${value.y.toFixed(3)}m ${value.z.toFixed(3)}m`

const vectorToHotspotValue = (value: ModelVectorValue | undefined, fallback = ''): string => {
  if (!value) return fallback
  if (typeof value === 'string') return value

  const maybeVector = value as unknown as {
    x?: number | string
    y?: number | string
    z?: number | string
    toString?: () => string
  }

  const toNumber = (input: number | string | undefined): number => {
    const parsed = typeof input === 'number' ? input : Number(input)
    return Number.isFinite(parsed) ? parsed : NaN
  }

  const vx = toNumber(maybeVector.x)
  const vy = toNumber(maybeVector.y)
  const vz = toNumber(maybeVector.z)
  if (!Number.isNaN(vx) && !Number.isNaN(vy) && !Number.isNaN(vz)) {
    return formatVector({ x: vx, y: vy, z: vz })
  }

  if (typeof maybeVector.toString === 'function') {
    const asString = maybeVector.toString()
    if (asString && asString !== '[object Object]') {
      return asString
    }
  }
  return fallback
}

export default function CraneDefectWorkbench() {
  const { token, user } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const modelViewerRef = useRef<ModelViewerElement | null>(null)

  const [equipment, setEquipment] = useState<EquipmentItem[]>([])
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null)
  const [nodes, setNodes] = useState<DefectNode[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const [violations, setViolations] = useState<NodeViolation[]>([])

  const [loadingEquipment, setLoadingEquipment] = useState(false)
  const [loadingNodes, setLoadingNodes] = useState(false)
  const [loadingViolations, setLoadingViolations] = useState(false)
  const [creatingViolation, setCreatingViolation] = useState(false)
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [savingNode, setSavingNode] = useState(false)
  const [deletingNodeId, setDeletingNodeId] = useState<number | null>(null)

  const [editingNodeId, setEditingNodeId] = useState<number | null>(null)
  const [nodeForm, setNodeForm] = useState<NodeFormState>(emptyNodeForm())
  const [isPickMode, setIsPickMode] = useState(false)
  const [showCreateViolationModal, setShowCreateViolationModal] = useState(false)
  const [violationDraft, setViolationDraft] = useState<ViolationDraftForm>({
    description: '',
    photos: [],
  })

  const canCreateViolation = canMutateData(user)
  const isAdmin = user?.roles?.some((r) => r.name === 'admin') || false

  const visibleNodes = useMemo(
    () => nodes.filter((node) => node.is_active).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [nodes]
  )

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || visibleNodes[0] || null,
    [nodes, selectedNodeId, visibleNodes]
  )

  const nodeViolationStats = useMemo(() => {
    const stats = new Map<number, NodeViolationStats>()

    for (const violation of violations) {
      if (!violation.defect_node_id) continue

      const existing = stats.get(violation.defect_node_id) || {
        total: 0,
        open: 0,
        resolved: 0,
        overdue: 0,
        maxOpenSeverity: null,
        latest: [],
      }

      existing.total += 1
      if (violation.status === 'resolved') {
        existing.resolved += 1
      } else {
        existing.open += 1
        if (violation.is_overdue) {
          existing.overdue += 1
        }
        if (
          !existing.maxOpenSeverity ||
          severityPriority[violation.severity] > severityPriority[existing.maxOpenSeverity]
        ) {
          existing.maxOpenSeverity = violation.severity
        }
      }
      existing.latest.push(violation)
      stats.set(violation.defect_node_id, existing)
    }

    Array.from(stats.values()).forEach((entry) => {
      entry.latest.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      entry.latest = entry.latest.slice(0, 5)
    })

    return stats
  }, [violations])

  const selectedNodeStats = selectedNode ? nodeViolationStats.get(selectedNode.id) || null : null
  const equipmentViolationSummary = useMemo(() => {
    return violations.reduce(
      (acc, violation) => {
        acc.total += 1
        if (violation.status === 'resolved') {
          acc.resolved += 1
        } else {
          acc.open += 1
          if (violation.is_overdue) acc.overdue += 1
        }
        return acc
      },
      { total: 0, open: 0, resolved: 0, overdue: 0 }
    )
  }, [violations])

  const draftHotspotPosition = useMemo(() => nodeForm.position.trim(), [nodeForm.position])
  const draftHotspotNormal = useMemo(() => nodeForm.normal.trim() || '0m 1m 0m', [nodeForm.normal])

  const fetchEquipment = async () => {
    if (!token) return
    try {
      setLoadingEquipment(true)
      const response = await axios.get(`${API_URL}/api/equipment`, {
        params: { limit: 1000 },
        headers: { Authorization: `Bearer ${token}` },
      })
      const rows = Array.isArray(response.data) ? response.data : response.data?.items || []
      const emk = rows.filter(isEmkEquipment)
      setEquipment(emk)
      setSelectedEquipmentId((prev) => {
        if (prev && emk.some((item: EquipmentItem) => item.id === prev)) return prev
        return emk[0]?.id ?? null
      })
    } catch (error) {
      console.error('Ошибка загрузки оборудования:', error)
      addNotification('Не удалось загрузить список оборудования ЭМК', 'error')
    } finally {
      setLoadingEquipment(false)
    }
  }

  const fetchNodes = async () => {
    if (!token) return
    try {
      setLoadingNodes(true)
      const response = await axios.get(`${API_URL}/api/defect-nodes`, {
        params: { active_only: !isAdmin },
        headers: { Authorization: `Bearer ${token}` },
      })
      const rows = Array.isArray(response.data) ? response.data : []
      setNodes(rows)

      const activeRows = rows.filter((row: DefectNode) => row.is_active)
      setSelectedNodeId((prev) => {
        if (prev && rows.some((row: DefectNode) => row.id === prev)) return prev
        return activeRows[0]?.id ?? rows[0]?.id ?? null
      })
    } catch (error) {
      console.error('Ошибка загрузки узлов дефектовки:', error)
      addNotification('Не удалось загрузить узлы дефектовки', 'error')
    } finally {
      setLoadingNodes(false)
    }
  }

  const fetchViolations = async (equipmentId: number) => {
    if (!token) return

    try {
      setLoadingViolations(true)
      const response = await axios.get(`${API_URL}/api/violations`, {
        params: { equipment_id: equipmentId, limit: 1000 },
        headers: { Authorization: `Bearer ${token}` },
      })
      const rows = Array.isArray(response.data) ? response.data : []
      const normalized = rows
        .filter((row: any) => row?.defect_node_id != null)
        .map((row: any) => ({
          id: row.id,
          defect_node_id: row.defect_node_id,
          description: row.description || '',
          severity: (row.severity || 'medium') as Severity,
          status: row.status || 'open',
          created_at: row.created_at,
          deadline: row.deadline || null,
          is_overdue: Boolean(row.is_overdue),
        }))

      setViolations(normalized)
    } catch (error) {
      console.error('Ошибка загрузки нарушений 3D-дефектовки:', error)
      addNotification('Не удалось загрузить нарушения по выбранному ЭМК', 'error')
      setViolations([])
    } finally {
      setLoadingViolations(false)
    }
  }

  useEffect(() => {
    if (!token) return
    fetchEquipment()
  }, [token])

  useEffect(() => {
    if (!token) return
    fetchNodes()
  }, [token, isAdmin])

  useEffect(() => {
    if (!token || !selectedEquipmentId) {
      setViolations([])
      return
    }
    fetchViolations(selectedEquipmentId)
  }, [token, selectedEquipmentId])

  const resetNodeForm = () => {
    setEditingNodeId(null)
    setNodeForm(emptyNodeForm())
    setIsPickMode(false)
  }

  const onEditNode = (node: DefectNode) => {
    setEditingNodeId(node.id)
    setNodeForm({
      key: node.key || '',
      title: node.title || '',
      description: node.description || '',
      recommendation: node.recommendation || '',
      severity: node.severity || 'medium',
      position: node.position || '',
      normal: node.normal || '0m 1m 0m',
      hotspot_size: node.hotspot_size != null ? String(node.hotspot_size) : '',
      sort_order: String(node.sort_order ?? 100),
      is_active: node.is_active,
    })
  }

  const onSaveNode = async () => {
    if (!token || !isAdmin) return
    if (!nodeForm.title.trim() || !nodeForm.description.trim() || !nodeForm.position.trim()) {
      addNotification('Заполните обязательные поля узла: название, описание, позиция', 'error')
      return
    }

    const payload = {
      key: nodeForm.key.trim() || undefined,
      title: nodeForm.title.trim(),
      description: nodeForm.description.trim(),
      recommendation: nodeForm.recommendation.trim() || null,
      severity: nodeForm.severity,
      position: nodeForm.position.trim(),
      normal: nodeForm.normal.trim() || null,
      hotspot_size: toNumberOrNull(nodeForm.hotspot_size),
      sort_order: Number(nodeForm.sort_order) || 100,
      is_active: nodeForm.is_active,
    }

    try {
      setSavingNode(true)
      if (editingNodeId) {
        await axios.put(`${API_URL}/api/defect-nodes/${editingNodeId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        })
        addNotification('Узел дефектовки обновлён', 'success')
      } else {
        const response = await axios.post(`${API_URL}/api/defect-nodes`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        })
        addNotification('Узел дефектовки создан', 'success')
        if (response.data?.id) {
          setSelectedNodeId(response.data.id)
        }
      }
      await fetchNodes()
      resetNodeForm()
    } catch (error: any) {
      const message = error?.response?.data?.detail || 'Не удалось сохранить узел дефектовки'
      addNotification(message, 'error')
    } finally {
      setSavingNode(false)
    }
  }

  const onDeleteNode = async (node: DefectNode) => {
    if (!token || !isAdmin) return
    if (!window.confirm(`Удалить узел "${node.title}"?`)) return

    try {
      setDeletingNodeId(node.id)
      await axios.delete(`${API_URL}/api/defect-nodes/${node.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      addNotification('Узел дефектовки удалён', 'success')
      await fetchNodes()
      if (selectedNodeId === node.id) {
        setSelectedNodeId(null)
      }
    } catch (error: any) {
      const message = error?.response?.data?.detail || 'Не удалось удалить узел дефектовки'
      addNotification(message, 'error')
    } finally {
      setDeletingNodeId(null)
    }
  }

  const openCreateViolationModal = () => {
    if (!selectedEquipmentId) {
      addNotification('Сначала выберите кран ЭМК', 'error')
      return
    }
    if (!selectedNode) {
      addNotification('Нет выбранного узла дефектовки', 'error')
      return
    }
    setViolationDraft({
      description: `3D-дефектовка: ${selectedNode.title}. ${selectedNode.description}`,
      photos: [],
    })
    setShowCreateViolationModal(true)
  }

  const closeCreateViolationModal = (force = false) => {
    if (!force && (creatingViolation || uploadingPhotos)) return
    setShowCreateViolationModal(false)
    setViolationDraft({ description: '', photos: [] })
  }

  const onDraftPhotosChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files || []).slice(0, 10)
    setViolationDraft((prev) => ({ ...prev, photos: nextFiles }))
  }

  const formatDateTime = (value?: string | null) => {
    if (!value) return '—'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '—'
    return parsed.toLocaleString('ru-RU')
  }

  const getNodeHotspotClass = (nodeId: number, isSelected: boolean) => {
    const stats = nodeViolationStats.get(nodeId)
    const selectedClass = isSelected ? 'scale-110 ring-4 ring-offset-2 ring-primary-200' : ''

    if (!stats || stats.total === 0) {
      return `bg-white/90 border-primary-600 hover:scale-110 ${selectedClass}`.trim()
    }
    if (stats.open > 0) {
      const tone =
        stats.overdue > 0 || stats.maxOpenSeverity === 'critical'
          ? 'bg-rose-600 border-white text-white'
          : stats.maxOpenSeverity === 'high'
            ? 'bg-orange-500 border-white text-white'
            : stats.maxOpenSeverity === 'medium'
              ? 'bg-amber-500 border-white text-white'
              : 'bg-sky-500 border-white text-white'
      return `${tone} hover:scale-110 ${selectedClass}`.trim()
    }
    return `bg-emerald-500 border-white text-white hover:scale-110 ${selectedClass}`.trim()
  }

  const createViolationFromNode = async () => {
    if (!token || !selectedEquipmentId || !selectedNode) {
      addNotification('Не хватает данных для создания нарушения', 'error')
      return
    }
    if (!violationDraft.description.trim()) {
      addNotification('Введите описание дефекта', 'error')
      return
    }

    try {
      setCreatingViolation(true)

      const violationPayload = {
        equipment_id: selectedEquipmentId,
        defect_node_id: selectedNode.id,
        description: violationDraft.description.trim(),
        severity: selectedNode.severity,
        violation_type: 'дефектовка',
        location: selectedNode.title,
        source: 'defectovka_3d',
        attachment_meta: {
          defect_node_id: selectedNode.id,
          defect_node_key: selectedNode.key,
          defect_node_title: selectedNode.title,
          hotspot_position: selectedNode.position,
        },
      }

      const violationResponse = await axios.post(`${API_URL}/api/violations`, violationPayload, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const createdViolation = violationResponse.data

      const uploadedFileIds: number[] = []
      if (violationDraft.photos.length > 0 && createdViolation?.id) {
        setUploadingPhotos(true)
        for (const photo of violationDraft.photos) {
          const formData = new FormData()
          formData.append('file', photo)
          formData.append('description', `Фото дефекта: ${selectedNode.title}`)

          const fileResponse = await axios.post(`${API_URL}/api/files/upload`, formData, {
            params: { violation_id: createdViolation.id, equipment_id: selectedEquipmentId },
            headers: { Authorization: `Bearer ${token}` },
          })
          if (fileResponse.data?.id) {
            uploadedFileIds.push(fileResponse.data.id)
          }
        }
      }

      if (uploadedFileIds.length > 0 && createdViolation?.id) {
        const currentMeta =
          createdViolation?.attachment_meta && typeof createdViolation.attachment_meta === 'object'
            ? createdViolation.attachment_meta
            : {}
        await axios.put(
          `${API_URL}/api/violations/${createdViolation.id}`,
          {
            attachment_meta: {
              ...currentMeta,
              file_ids: uploadedFileIds,
              file_count: uploadedFileIds.length,
            },
          },
          { headers: { Authorization: `Bearer ${token}` } }
        )
      }

      addNotification(
        uploadedFileIds.length > 0
          ? `Нарушение создано (ID: ${createdViolation?.id ?? '—'}), фото прикреплены`
          : `Нарушение создано (ID: ${createdViolation?.id ?? '—'})`,
        'success'
      )
      if (selectedEquipmentId) {
        await fetchViolations(selectedEquipmentId)
      }
      closeCreateViolationModal(true)
    } catch (error: any) {
      const message = error?.response?.data?.detail || 'Не удалось создать нарушение по узлу'
      addNotification(message, 'error')
    } finally {
      setCreatingViolation(false)
      setUploadingPhotos(false)
    }
  }

  useEffect(() => {
    if (!isAdmin || !isPickMode) return
    const viewer = modelViewerRef.current
    if (!viewer) return

    const handleViewerClick = (event: Event) => {
      const mouseEvent = event as MouseEvent
      const target = mouseEvent.target as HTMLElement | null
      if (target?.closest('button')) return

      if (typeof viewer.positionAndNormalFromPoint !== 'function') {
        addNotification('Выбор точки недоступен: 3D viewer еще не готов', 'error')
        return
      }

      const rect = viewer.getBoundingClientRect()
      const x = mouseEvent.clientX - rect.left
      const y = mouseEvent.clientY - rect.top
      const hit =
        viewer.positionAndNormalFromPoint(x, y) ||
        viewer.positionAndNormalFromPoint(mouseEvent.clientX, mouseEvent.clientY)
      const pickedPosition = vectorToHotspotValue(hit?.position)
      const pickedNormal = vectorToHotspotValue(hit?.normal, '0m 1m 0m')

      if (!pickedPosition) {
        addNotification('Не удалось определить точку. Кликните по поверхности модели.', 'error')
        return
      }

      setNodeForm((prev) => ({
        ...prev,
        position: pickedPosition,
        normal: pickedNormal,
      }))
      setIsPickMode(false)
      addNotification('Точка узла выбрана на 3D-модели', 'success')
    }

    viewer.addEventListener('click', handleViewerClick)
    return () => {
      viewer.removeEventListener('click', handleViewerClick)
    }
  }, [isAdmin, isPickMode, addNotification])

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-6">
      <Script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js" />

      <div className="bg-white border border-gray-200 rounded-xl shadow-soft p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="text-sm font-medium text-gray-700">Кран:</label>
          <select
            value={selectedEquipmentId ?? ''}
            onChange={(e) => setSelectedEquipmentId(e.target.value ? Number(e.target.value) : null)}
            className="min-w-[320px] max-w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            disabled={loadingEquipment || equipment.length === 0}
          >
            {equipment.length === 0 && <option value="">ЭМК не найдены в справочнике</option>}
            {equipment.map((item) => (
              <option key={item.id} value={item.id}>
                {item.passport_number} — {item.equipment_type}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500">
            Доступны только ЭМК. Выберите узел справа или создайте/отредактируйте его.
          </span>
        </div>

        <model-viewer
          ref={modelViewerRef}
          src={MODEL_SRC}
          camera-controls
          touch-action="pan-y"
          shadow-intensity="1"
          environment-image="neutral"
          exposure="1"
          style={{
            width: '100%',
            height: '72vh',
            minHeight: '480px',
            background: '#f8fafc',
            borderRadius: '12px',
            cursor: isPickMode ? 'crosshair' : 'grab',
          }}
        >
          {!isPickMode &&
            visibleNodes.map((node) => (
              <button
                key={node.id}
                slot={`hotspot-node-${node.id}`}
                data-position={node.position}
                data-normal={node.normal || '0m 1m 0m'}
                className={`w-6 h-6 rounded-full border-2 shadow-lg transition-all ${getNodeHotspotClass(
                  node.id,
                  node.id === selectedNode?.id
                )}`}
                onClick={() => setSelectedNodeId(node.id)}
                title={node.title}
                aria-label={node.title}
              />
            ))}
          {isAdmin && draftHotspotPosition && (
            <button
              slot="hotspot-draft"
              data-position={draftHotspotPosition}
              data-normal={draftHotspotNormal}
              className="w-7 h-7 rounded-full border-2 border-sky-600 bg-sky-200/90 shadow-lg"
              title="Черновая точка узла"
              aria-label="Черновая точка узла"
            />
          )}
        </model-viewer>

        {isPickMode && (
          <div className="mt-3 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            Режим выбора точки: кликните по нужному месту на 3D-модели.
          </div>
        )}

        {visibleNodes.length === 0 && !loadingNodes && (
          <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Нет активных узлов дефектовки. Администратор может добавить их в панели справа.
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-soft p-4">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Сводка по выбранному ЭМК</h3>
          {loadingViolations ? (
            <div className="text-sm text-gray-500">Загрузка нарушений...</div>
          ) : selectedEquipmentId ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-gray-200 bg-slate-50 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-gray-500">Всего</div>
                <div className="text-lg font-semibold text-gray-900">{equipmentViolationSummary.total}</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-amber-700">Открыто</div>
                <div className="text-lg font-semibold text-amber-900">{equipmentViolationSummary.open}</div>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-rose-700">Просрочено</div>
                <div className="text-lg font-semibold text-rose-900">{equipmentViolationSummary.overdue}</div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-emerald-700">Устранено</div>
                <div className="text-lg font-semibold text-emerald-900">{equipmentViolationSummary.resolved}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">Выберите кран ЭМК, чтобы увидеть сводку.</div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-soft p-4">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Узлы дефектовки</h3>
          <div className="space-y-2 max-h-[280px] overflow-auto pr-1">
            {loadingNodes && <div className="text-sm text-gray-500">Загрузка узлов...</div>}
            {!loadingNodes && nodes.length === 0 && (
              <div className="text-sm text-gray-500">Узлы дефектовки пока не настроены.</div>
            )}
            {!loadingNodes &&
              nodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                    node.id === selectedNode?.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {(() => {
                    const stats = nodeViolationStats.get(node.id)
                    return (
                      <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900">{node.title}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${severityClass[node.severity]}`}>
                      {severityLabel[node.severity]}
                    </span>
                  </div>
                        {stats && stats.total > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                            <span>Связано: {stats.total}</span>
                            <span>Открыто: {stats.open}</span>
                            <span>Просрочено: {stats.overdue}</span>
                          </div>
                        )}
                  {!node.is_active && <div className="text-xs text-gray-500 mt-1">Неактивный узел</div>}
                      </>
                    )
                  })()}
                </button>
              ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-soft p-4 space-y-3">
          {selectedNode ? (
            <>
              <h3 className="text-base font-semibold text-gray-900">{selectedNode.title}</h3>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Что проверить:</span> {selectedNode.description}
              </p>
              {selectedNode.recommendation && (
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">Рекомендация:</span> {selectedNode.recommendation}
                </p>
              )}
              <p className="text-xs text-gray-500">
                Позиция: <code>{selectedNode.position}</code>
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-gray-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Связано</div>
                  <div className="text-base font-semibold text-gray-900">{selectedNodeStats?.total ?? 0}</div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-amber-700">Открыто</div>
                  <div className="text-base font-semibold text-amber-900">{selectedNodeStats?.open ?? 0}</div>
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-rose-700">Просрочено</div>
                  <div className="text-base font-semibold text-rose-900">{selectedNodeStats?.overdue ?? 0}</div>
                </div>
              </div>
              {loadingViolations ? (
                <div className="text-sm text-gray-500">Загрузка истории дефектов...</div>
              ) : selectedNodeStats?.latest?.length ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-gray-900">Последние нарушения по узлу</div>
                  <div className="space-y-2">
                    {selectedNodeStats.latest.map((violation) => (
                      <div key={violation.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-gray-900">#{violation.id}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${severityClass[violation.severity]}`}>
                            {severityLabel[violation.severity]}
                          </span>
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded ${
                              violation.status === 'resolved'
                                ? 'bg-emerald-100 text-emerald-700'
                                : violation.is_overdue
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {violation.is_overdue && violation.status !== 'resolved'
                              ? 'Просрочено'
                              : statusLabel[violation.status] || violation.status}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-gray-700 line-clamp-3">{violation.description}</div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          Создано: {formatDateTime(violation.created_at)}
                          {violation.deadline ? ` · Срок: ${formatDateTime(violation.deadline)}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">По этому узлу пока нет зарегистрированных нарушений.</div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">Выберите узел дефектовки из списка.</p>
          )}

          {canCreateViolation ? (
            <button
              type="button"
              onClick={openCreateViolationModal}
              disabled={!selectedEquipmentId || !selectedNode || creatingViolation}
              className="w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold rounded-lg text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {creatingViolation ? 'Создание...' : 'Создать нарушение по узлу (с фото)'}
            </button>
          ) : (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              У вас режим просмотра. Создание нарушений недоступно.
            </div>
          )}
          {equipment.length === 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              В справочнике нет ЭМК-оборудования. Добавьте ЭМК в разделе оборудования.
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-soft p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-900">Управление узлами (admin)</h3>
              <button
                type="button"
                onClick={resetNodeForm}
                className="text-xs font-medium px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Новый узел
              </button>
            </div>

            <div className="space-y-2 max-h-44 overflow-auto pr-1">
              {nodes.map((node) => (
                <div key={node.id} className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-2 py-1.5">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-800 truncate">{node.title}</div>
                    <div className="text-[11px] text-gray-500 truncate">{node.key}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEditNode(node)}
                      className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                    >
                      Изм.
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteNode(node)}
                      disabled={deletingNodeId === node.id}
                      className="text-xs px-2 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                    >
                      {deletingNodeId === node.id ? '...' : 'Удал.'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                value={nodeForm.title}
                onChange={(e) => setNodeForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Название узла *"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                value={nodeForm.key}
                onChange={(e) => setNodeForm((prev) => ({ ...prev, key: e.target.value }))}
                placeholder="Ключ (латиница, опц.)"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                value={nodeForm.position}
                onChange={(e) => setNodeForm((prev) => ({ ...prev, position: e.target.value }))}
                placeholder="Позиция hotspot *"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={() => setIsPickMode((prev) => !prev)}
                className={`px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                  isPickMode
                    ? 'border-blue-400 text-blue-700 bg-blue-50'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {isPickMode ? 'Отменить выбор точки' : 'Выбрать точку на 3D'}
              </button>
              <input
                value={nodeForm.normal}
                onChange={(e) => setNodeForm((prev) => ({ ...prev, normal: e.target.value }))}
                placeholder="Нормаль hotspot"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <select
                value={nodeForm.severity}
                onChange={(e) => setNodeForm((prev) => ({ ...prev, severity: e.target.value as Severity }))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="low">Низкая</option>
                <option value="medium">Средняя</option>
                <option value="high">Высокая</option>
                <option value="critical">Критическая</option>
              </select>
              <input
                value={nodeForm.sort_order}
                onChange={(e) => setNodeForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                placeholder="Порядок (число)"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                value={nodeForm.hotspot_size}
                onChange={(e) => setNodeForm((prev) => ({ ...prev, hotspot_size: e.target.value }))}
                placeholder="Размер точки (опц.)"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 px-1">
                <input
                  type="checkbox"
                  checked={nodeForm.is_active}
                  onChange={(e) => setNodeForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                Активный узел
              </label>
            </div>

            <textarea
              value={nodeForm.description}
              onChange={(e) => setNodeForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Описание проверки *"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <textarea
              value={nodeForm.recommendation}
              onChange={(e) => setNodeForm((prev) => ({ ...prev, recommendation: e.target.value }))}
              placeholder="Рекомендация (опц.)"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />

            <button
              type="button"
              onClick={onSaveNode}
              disabled={savingNode}
              className="w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold rounded-lg text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
            >
              {savingNode ? 'Сохранение...' : editingNodeId ? 'Сохранить изменения узла' : 'Добавить узел'}
            </button>
          </div>
        )}
      </div>

      {showCreateViolationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/45"
            onClick={() => closeCreateViolationModal()}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-xl rounded-xl border border-gray-200 bg-white shadow-xl p-5 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Создание нарушения по узлу</h3>
              <p className="text-sm text-gray-600 mt-1">
                Узел: <span className="font-medium">{selectedNode?.title || '—'}</span>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Описание дефекта *</label>
              <textarea
                value={violationDraft.description}
                onChange={(e) => setViolationDraft((prev) => ({ ...prev, description: e.target.value }))}
                rows={5}
                placeholder="Опишите фактический дефект по узлу..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Фото дефекта (до 10 файлов)</label>
              <input type="file" accept="image/*" multiple onChange={onDraftPhotosChange} />
              {violationDraft.photos.length > 0 && (
                <div className="text-xs text-gray-600">
                  Выбрано фото: {violationDraft.photos.map((file) => file.name).join(', ')}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => closeCreateViolationModal()}
                disabled={creatingViolation || uploadingPhotos}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={createViolationFromNode}
                disabled={creatingViolation || uploadingPhotos}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
              >
                {creatingViolation
                  ? uploadingPhotos
                    ? 'Загрузка фото...'
                    : 'Создание нарушения...'
                  : 'Создать нарушение'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
