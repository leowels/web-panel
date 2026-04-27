# API Endpoints

_Generated: 2026-03-04 21:48:58_

Total router endpoints: **161**

## acts

- `GET /api/acts`
- `POST /api/acts`
- `DELETE /api/acts/{act_id}`
- `GET /api/acts/{act_id}`
- `PUT /api/acts/{act_id}`
- `POST /api/acts/{act_id}/export/pdf`
- `GET /api/acts/{act_id}/export/table`
- `POST /api/acts/{act_id}/generate`
- `POST /api/acts/{act_id}/generate-draft`

## ai

- `POST /api/ai/actions/suggest`
- `POST /api/ai/chat`
- `POST /api/ai/classify_violation`
- `GET /api/ai/equipment/{equipment_id}/risk`
- `POST /api/ai/generate`
- `GET /api/ai/suggestions`
- `GET /api/ai/test`
- `POST /api/ai/voice_to_text`

## alerts

- `GET /api/alerts`
- `POST /api/alerts/ack-all`
- `POST /api/alerts/run`
- `GET /api/alerts/summary`
- `POST /api/alerts/{alert_id}/ack`

## analytics

- `GET /api/analytics/equipment/{equipment_id}/risk`
- `GET /api/analytics/kpi-mechanics`
- `GET /api/analytics/risk-overview`
- `GET /api/analytics/violations-dynamics`

## audit

- `GET /api/audit`
- `GET /api/audit/errors`
- `GET /api/audit/errors/summary`
- `POST /api/audit/errors/{error_id}/resolve`
- `GET /api/audit/events`

## auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/refresh`
- `POST /api/auth/register`

## checklists

- `GET /api/checklists`
- `POST /api/checklists`
- `DELETE /api/checklists/items/{item_id}`
- `PUT /api/checklists/items/{item_id}`
- `GET /api/checklists/{template_id}`
- `PUT /api/checklists/{template_id}`
- `POST /api/checklists/{template_id}/items`
- `POST /api/checklists/{template_id}/reorder`
- `POST /api/checklists/{template_id}/version`

## documents

- `GET /api/documents`
- `POST /api/documents`
- `DELETE /api/documents/{document_id}`
- `PUT /api/documents/{document_id}`

## defect-nodes

- `GET /api/defect-nodes`
- `POST /api/defect-nodes`
- `PUT /api/defect-nodes/{node_id}`
- `DELETE /api/defect-nodes/{node_id}`

## equipment

- `GET /api/equipment`
- `POST /api/equipment`
- `POST /api/equipment/bulk`
- `PUT /api/equipment/bulk/dates`
- `PUT /api/equipment/bulk/update`
- `POST /api/equipment/bulk/upload`
- `GET /api/equipment/export`
- `POST /api/equipment/ocr-import`
- `POST /api/equipment/ocr-upsert`
- `GET /api/equipment/risk/top`
- `GET /api/equipment/types`
- `DELETE /api/equipment/{equipment_id}`
- `GET /api/equipment/{equipment_id}`
- `PUT /api/equipment/{equipment_id}`
- `GET /api/equipment/{equipment_id}/history`
- `GET /api/equipment/{equipment_id}/risk`
- `GET /api/equipment/{equipment_id}/violations`

## files

- `GET /api/files`
- `POST /api/files/upload`
- `DELETE /api/files/{file_id}`
- `GET /api/files/{file_id}`

## inspections

- `GET /api/inspections`
- `POST /api/inspections`
- `GET /api/inspections/export`
- `DELETE /api/inspections/{inspection_id}`
- `GET /api/inspections/{inspection_id}`
- `PUT /api/inspections/{inspection_id}`
- `POST /api/inspections/{inspection_id}/answers`

## knowledge

- `GET /api/knowledge`
- `POST /api/knowledge`
- `POST /api/knowledge/ai/search`
- `POST /api/knowledge/embeddings/backfill`
- `POST /api/knowledge/upload`
- `DELETE /api/knowledge/{knowledge_id}`
- `GET /api/knowledge/{knowledge_id}`
- `PUT /api/knowledge/{knowledge_id}`

## notifications

- `GET /api/notifications`
- `POST /api/notifications/generate-overdue`
- `POST /api/notifications/mark-all-read`
- `GET /api/notifications/overdue`
- `GET /api/notifications/stats`
- `DELETE /api/notifications/{notification_id}`
- `POST /api/notifications/{notification_id}/read`

## permits

- `GET /api/permits`
- `POST /api/permits`
- `DELETE /api/permits/{permit_id}`
- `GET /api/permits/{permit_id}`
- `PUT /api/permits/{permit_id}`
- `POST /api/permits/{permit_id}/status`

## reports

- `GET /api/reports`
- `POST /api/reports/ai-draft`
- `POST /api/reports/generate`
- `DELETE /api/reports/{report_id}`
- `GET /api/reports/{report_id}`
- `GET /api/reports/{report_id}/download`

## settings

- `GET /api/settings/backup/export`
- `POST /api/settings/backup/import`
- `GET /api/settings/system`
- `GET /api/settings/system/{key}`
- `PUT /api/settings/system/{key}`
- `GET /api/settings/user`
- `PUT /api/settings/user`
- `POST /api/settings/user/change-password`

## tasks

- `GET /api/tasks`
- `POST /api/tasks`
- `DELETE /api/tasks/{task_id}`
- `GET /api/tasks/{task_id}`
- `PUT /api/tasks/{task_id}`
- `POST /api/tasks/{task_id}/status`

## telegram

- `POST /api/telegram/defects`
- `GET /api/telegram/equipment`
- `POST /api/telegram/files`
- `GET /api/telegram/health`
- `GET /api/telegram/workshops`

## users

- `GET /api/users`
- `POST /api/users`
- `GET /api/users/me`
- `GET /api/users/roles/list`
- `DELETE /api/users/{user_id}`
- `GET /api/users/{user_id}`
- `PUT /api/users/{user_id}`
- `GET /api/users/{user_id}/activity`
- `POST /api/users/{user_id}/change-password`

## violations

- `GET /api/violations`
- `POST /api/violations`
- `POST /api/violations/ai/generate`
- `POST /api/violations/bulk`
- `PUT /api/violations/bulk/status`
- `GET /api/violations/export`
- `GET /api/violations/sla-rules`
- `POST /api/violations/sla-rules`
- `DELETE /api/violations/sla-rules/{rule_id}`
- `PUT /api/violations/sla-rules/{rule_id}`
- `POST /api/violations/sla/apply`
- `DELETE /api/violations/{violation_id}`
- `GET /api/violations/{violation_id}`
- `PUT /api/violations/{violation_id}`
- `GET /api/violations/{violation_id}/audit`

## workflow

- `POST /api/workflow/acts/{act_id}/close`
- `GET /api/workflow/equipment/{equipment_id}`
- `GET /api/workflow/overview`
- `POST /api/workflow/violations/{violation_id}/act`
- `POST /api/workflow/violations/{violation_id}/task`

## workshop-map

- `GET /api/workshop-map`
- `PUT /api/workshop-map`
- `GET /api/workshop-map/background/{filename}`
- `POST /api/workshop-map/import/kompas`
- `POST /api/workshop-map/upload`

## Main App Routes

- `GET /`
- `GET /api`
- `GET /api/health`
- `DELETE /{path:path}`
- `DELETE /{path:path}`
- `GET /{path:path}`
- `GET /{path:path}`
- `PATCH /{path:path}`
- `PATCH /{path:path}`
- `POST /{path:path}`
- `POST /{path:path}`
- `PUT /{path:path}`
- `PUT /{path:path}`
