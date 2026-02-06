'use client'

import { useState } from 'react'
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

export default function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false)
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
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Открыть мобильное меню"
        className="lg:hidden fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 w-14 h-14 bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-full shadow-strong flex items-center justify-center hover:from-primary-700 hover:to-primary-800 transition-all duration-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black bg-opacity-60 z-30 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="lg:hidden fixed bottom-24 right-4 sm:right-6 z-40 bg-white rounded-xl shadow-strong p-3 min-w-[240px] max-h-[70vh] overflow-y-auto border border-gray-200"
            style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
          >
            <nav>
              <ul className="space-y-1">
                {menuItems.map((item) => {
                  const isActive = pathname === item.href
                  const Icon = item.icon
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className={`flex items-center px-4 py-3 text-sm font-semibold rounded-lg transition-all duration-200 ${
                          isActive
                            ? 'bg-primary-50 text-primary-700 shadow-soft'
                            : 'text-gray-700 hover:bg-gray-50'
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
          </div>
        </>
      )}
    </>
  )
}

