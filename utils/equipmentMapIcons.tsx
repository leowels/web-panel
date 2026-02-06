/** Иконки для типов оборудования на карте цеха (emoji) */
export function getEquipmentTypeIcon(type: string): string {
  if (!type) return '⚙️'
  const t = type.toLowerCase()
  // Краны и кран-балки — иконка крана
  if (
    t.includes('кран') ||
    t.includes('балка') ||
    t.includes('монорельс') ||
    t.includes('консольно')
  ) {
    return '🏗️' // кран/строительная техника
  }
  if (t.includes('подъемник')) return '⬆️'
  if (t.includes('лифт')) return '🛗'
  if (t.includes('эскалатор')) return '📐'
  return '⚙️'
}
