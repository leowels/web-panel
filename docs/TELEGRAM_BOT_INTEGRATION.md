# Telegram Bot Integration (Defect Intake)

This project now supports receiving defect reports from an external Telegram bot service.

## 1) Backend Environment

Set these variables in backend runtime:

- `ENABLE_TELEGRAM_INGEST=true`
- `TELEGRAM_INGEST_TOKEN=<strong_random_token>`

The bot service must send this token in header:

- `X-Telegram-Ingest-Token: <strong_random_token>`

## 2) New API Endpoints

- `GET /api/telegram/health`
- `POST /api/telegram/files`
- `POST /api/telegram/defects`

## 3) File Upload (Photo From Bot)

`POST /api/telegram/files` as `multipart/form-data`

Required:

- `file` (binary)

Optional:

- `description`
- `equipment_id`

Header:

- `X-Telegram-Ingest-Token: <strong_random_token>`

Response example:

```json
{
  "file_id": 101,
  "filename": "tg_20260218_203001_123456_photo.jpg",
  "original_filename": "photo.jpg",
  "file_type": "photo",
  "mime_type": "image/jpeg",
  "file_size": 184321,
  "thumbnail_path": "uploads/thumbnails/thumb_tg_20260218_203001_123456_photo.jpg"
}
```

## 4) Defect Intake Request

`POST /api/telegram/defects`

```json
{
  "event_key": "tg:123456:777",
  "telegram_chat_id": "123456",
  "telegram_message_id": "777",
  "telegram_user_id": "99887766",
  "telegram_username": "inspector_ivan",
  "telegram_full_name": "Иван Петров",
  "workshop": "ЛЦ-2",
  "equipment_id": 152,
  "violation_type": "Повреждение остекления кабины",
  "description": "На кабине управления повреждено остекление.",
  "location": "Кабина управления",
  "severity": "medium",
  "deadline": "2026-03-15T00:00:00Z",
  "file_ids": [101, 102],
  "attachment_meta": {
    "bot_session_id": "abc-123"
  }
}
```

Notes:

- Equipment selector: provide one of:
  - `equipment_id`
  - `equipment_passport_number`
  - `equipment_inventory_number`
- Use `file_id` values from `POST /api/telegram/files` in `file_ids`.
- `event_key` is used for idempotency (duplicate protection).
- `file_ids` are linked to created violation.

## 5) Response

```json
{
  "status": "created",
  "violation_id": 113,
  "event_key": "tg:123456:777",
  "linked_files": 2,
  "source": "telegram"
}
```

If already processed:

```json
{
  "status": "duplicate",
  "violation_id": 113,
  "event_key": "tg:123456:777",
  "linked_files": 0,
  "source": "telegram"
}
```

## 6) Data/Audit

- Violation is created with `source="telegram"`.
- Telegram metadata is saved to `violations.attachment_meta`.
- Idempotency key is stored in `telegram_ingest_events`.
- Audit log is written with source `telegram`.
