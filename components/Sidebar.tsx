'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import DashboardIcon from './icons/DashboardIcon'
import UsersIcon from './icons/UsersIcon'
import EquipmentIcon from './icons/EquipmentIcon'
import ChecklistIcon from './icons/ChecklistIcon'
import InspectionIcon from './icons/InspectionIcon'
import ViolationIcon from './icons/ViolationIcon'
import ActIcon from './icons/ActIcon'
import KnowledgeIcon from './icons/KnowledgeIcon'
import AuditIcon from './icons/AuditIcon'
import SettingsIcon from './icons/SettingsIcon'

export default function Sidebar() {
  const pathname = usePathname()

  const menuItems = [
    { name: 'Дашборд', href: '/dashboard', icon: DashboardIcon },
    { name: 'Пользователи', href: '/users', icon: UsersIcon },
    { name: 'Оборудование', href: '/equipment', icon: EquipmentIcon },
    { name: 'Карта цеха', href: '/workshop-map', icon: EquipmentIcon },
    { name: 'Чек-листы', href: '/checklists', icon: ChecklistIcon },
    { name: 'Осмотры', href: '/inspections', icon: InspectionIcon },
    { name: 'Нарушения', href: '/violations', icon: ViolationIcon },
    { name: 'Акты', href: '/acts', icon: ActIcon },
    { name: 'База знаний', href: '/knowledge', icon: KnowledgeIcon },
    { name: 'Audit Log', href: '/audit', icon: AuditIcon },
    { name: 'Настройки', href: '/settings', icon: SettingsIcon },
  ]

  return (
    <aside className="hidden lg:block w-64 bg-gray-50 border-r border-gray-300 h-[calc(100vh-4rem)] overflow-y-auto">
      <nav className="p-3">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center px-4 py-3 text-sm font-semibold rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-white text-primary-700 shadow-soft border-l-4 border-primary-700'
                      : 'text-gray-700 hover:bg-white hover:text-primary-600 hover:shadow-soft'
                  }`}
                >
                  <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-primary-700' : 'text-gray-500'}`} />
                  {item.name}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}

