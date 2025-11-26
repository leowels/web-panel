export const EQUIPMENT_TYPES = [
  'Кран',
  'Подъемник',
  'Лифт',
  'Эскалатор',
  'Кран-балка электрическая',
  'Кран-балка ручная',
  'Монорельс с электрической талью',
  'Кран консольно-поворотный',
  'Другое',
] as const

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number]


