'use client'

import dynamic from 'next/dynamic'

const DocumentList = dynamic(() => import('./DocumentList'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
        </div>
      </div>
    </div>
  ),
})

export default DocumentList

