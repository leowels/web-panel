'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { getRoleNames } from '@/utils/roles'
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
  const { user } = useAuthStore()
  const roleNames = getRoleNames(user)
  const isAllowed = (roles?: string[]) => {
    if (!roles || roles.length === 0) return true
    return roles.some((role) => roleNames.includes(role as any))
  }

  const menuItems = [
    { name: 'Дашборд', href: '/dashboard', icon: DashboardIcon },
    {
      name: 'Отчеты',
      href: '/dashboard/reports',
      icon: AuditIcon,
      roles: ['admin', 'manager', 'auditor', 'inspector'],
    },
    { name: 'Пользователи', href: '/users', icon: UsersIcon, roles: ['admin'] },
    {
      name: 'Оборудование',
      href: '/equipment',
      icon: EquipmentIcon,
      roles: ['admin', 'inspector', 'operator', 'auditor', 'viewer'],
    },
    {
      name: 'Карта цеха',
      href: '/workshop-map',
      icon: EquipmentIcon,
      roles: ['admin', 'inspector', 'operator', 'viewer'],
    },
    {
      name: 'Дефектовка 3D',
      href: '/defectovka',
      icon: EquipmentIcon,
      roles: ['admin', 'inspector', 'operator', 'viewer', 'manager', 'auditor'],
    },
    {
      name: 'Чек-листы',
      href: '/checklists',
      icon: ChecklistIcon,
      roles: ['admin', 'inspector', 'operator'],
    },
    {
      name: 'Осмотры',
      href: '/inspections',
      icon: InspectionIcon,
      roles: ['admin', 'inspector', 'operator'],
    },
    {
      name: 'Сквозной workflow',
      href: '/workflow',
      icon: InspectionIcon,
      roles: ['admin', 'inspector'],
    },
    {
      name: 'Нарушения',
      href: '/violations',
      icon: ViolationIcon,
      roles: ['admin', 'inspector', 'operator', 'auditor', 'viewer', 'manager'],
    },
    {
      name: 'SLA-уведомления',
      href: '/alerts',
      icon: ViolationIcon,
      roles: ['admin', 'inspector', 'operator', 'auditor', 'manager'],
    },
    {
      name: 'Задачи',
      href: '/tasks',
      icon: InspectionIcon,
      roles: ['admin', 'inspector', 'operator', 'auditor', 'manager'],
    },
    {
      name: 'Акты',
      href: '/acts',
      icon: ActIcon,
      roles: ['admin', 'inspector', 'auditor', 'manager'],
    },
    {
      name: 'База знаний',
      href: '/knowledge',
      icon: KnowledgeIcon,
      roles: ['admin', 'inspector', 'auditor', 'viewer'],
    },
    { name: 'Журнал аудита', href: '/audit', icon: AuditIcon, roles: ['admin', 'auditor', 'manager'] },
    { name: 'Настройки', href: '/settings', icon: SettingsIcon, roles: ['admin'] },
  ]

  return (
    <aside className="hidden lg:block w-64 bg-gray-50 border-r border-gray-300 h-[calc(100vh-4rem)] overflow-y-auto">
      <nav className="p-3">
        <ul className="space-y-1">
          {menuItems.filter((item) => isAllowed(item.roles)).map((item) => {
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
