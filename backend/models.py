from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, ForeignKey, Float, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

# БЛОК 2: Пользователи и роли
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String)
    organization = Column(String)
    signature = Column(Text)  # Подпись для актов
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    
    # Relationships
    roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan", foreign_keys="UserRole.user_id")
    activities = relationship("UserActivity", back_populates="user", cascade="all, delete-orphan")

class Role(Base):
    __tablename__ = "roles"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)  # admin, inspector, viewer
    description = Column(String)
    permissions = Column(JSON)  # Список разрешений
    
    # Relationships
    user_roles = relationship("UserRole", back_populates="role")

class UserRole(Base):
    __tablename__ = "user_roles"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"))
    assigned_at = Column(DateTime, default=datetime.utcnow)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="roles", foreign_keys=[user_id])
    role = relationship("Role", back_populates="user_roles")

class UserActivity(Base):
    __tablename__ = "user_activities"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    action_type = Column(String)  # login, logout, create, update, delete
    entity_type = Column(String)  # user, equipment, inspection, violation
    entity_id = Column(Integer, nullable=True)
    description = Column(Text)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="activities")

# БЛОК 3: Справочник оборудования (ПС)
class Equipment(Base):
    __tablename__ = "equipment"
    
    id = Column(Integer, primary_key=True, index=True)
    equipment_type = Column(String, index=True)  # Тип ПС
    passport_number = Column(String, unique=True, index=True)  # Паспорт
    inventory_number = Column(String, unique=True, index=True, nullable=True)  # Инвентарный номер
    position = Column(String, nullable=True, index=True)  # Позиция
    workshop = Column(String, nullable=True, index=True)  # Цех
    load_capacity = Column(Float, nullable=True)  # Грузоподъемность
    manufacturer = Column(String, nullable=True)  # Завод
    installation_date = Column(DateTime, nullable=True)  # Дата ввода
    pto_date = Column(DateTime, nullable=True, index=True)  # Дата ПТО
    cto_date = Column(DateTime, nullable=True, index=True)  # Дата ЧТО
    installation_location = Column(String, nullable=True)  # Место установки
    status = Column(String, default="active", index=True)  # active, inactive, archived
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    files = relationship("File", back_populates="equipment", foreign_keys="File.equipment_id")
    inspections = relationship("Inspection", back_populates="equipment")
    violations = relationship("Violation", back_populates="equipment")
    history = relationship("EquipmentHistory", back_populates="equipment", cascade="all, delete-orphan")

class EquipmentHistory(Base):
    __tablename__ = "equipment_history"
    
    id = Column(Integer, primary_key=True, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"))
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    field_name = Column(String)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    equipment = relationship("Equipment", back_populates="history")

# БЛОК 4: Чек-листы
class ChecklistTemplate(Base):
    __tablename__ = "checklist_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    equipment_type = Column(String, nullable=True)  # Привязка к типу ПС
    version = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    items = relationship("ChecklistItem", back_populates="template", cascade="all, delete-orphan", order_by="ChecklistItem.order")
    inspections = relationship("Inspection", back_populates="checklist_template")

class ChecklistItem(Base):
    __tablename__ = "checklist_items"
    
    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("checklist_templates.id", ondelete="CASCADE"))
    item_type = Column(String)  # text, bool, photo, number, select
    label = Column(String)
    description = Column(Text, nullable=True)
    is_required = Column(Boolean, default=False)
    order = Column(Integer, default=0)
    options = Column(JSON, nullable=True)  # Для select типа
    validation_rules = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    template = relationship("ChecklistTemplate", back_populates="items")
    answers = relationship("InspectionAnswer", back_populates="item")

# БЛОК 5: Осмотры
class Inspection(Base):
    __tablename__ = "inspections"
    
    id = Column(Integer, primary_key=True, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"))
    checklist_template_id = Column(Integer, ForeignKey("checklist_templates.id", ondelete="SET NULL"))
    inspector_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String, default="draft")  # draft, in_progress, completed
    location_lat = Column(Float, nullable=True)
    location_lng = Column(Float, nullable=True)
    inspector_signature = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_synced = Column(Boolean, default=True)  # Для оффлайн режима
    
    # Relationships
    equipment = relationship("Equipment", back_populates="inspections")
    checklist_template = relationship("ChecklistTemplate", back_populates="inspections")
    answers = relationship("InspectionAnswer", back_populates="inspection", cascade="all, delete-orphan")
    violations = relationship("Violation", back_populates="inspection")

class InspectionAnswer(Base):
    __tablename__ = "inspection_answers"
    
    id = Column(Integer, primary_key=True, index=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id", ondelete="CASCADE"))
    item_id = Column(Integer, ForeignKey("checklist_items.id", ondelete="SET NULL"))
    value = Column(Text, nullable=True)  # JSON для сложных типов
    file_id = Column(Integer, ForeignKey("files.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    inspection = relationship("Inspection", back_populates="answers")
    item = relationship("ChecklistItem", back_populates="answers")
    file = relationship("File", foreign_keys=[file_id])

# БЛОК 6: Нарушения
class Violation(Base):
    __tablename__ = "violations"
    
    id = Column(Integer, primary_key=True, index=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id", ondelete="SET NULL"), nullable=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), index=True)
    source = Column(String, nullable=True)  # telegram, web, etc.
    reported_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    attachment_meta = Column(JSON, nullable=True)
    description = Column(Text)
    fnp_clause = Column(String, nullable=True)  # Пункт ФНП 461
    gost_clause = Column(String, nullable=True)  # Пункт ГОСТ
    severity = Column(String, default="medium", index=True)  # low, medium, high, critical
    criticality_level = Column(String, nullable=True, index=True)
    violation_type = Column(String, nullable=True, index=True)
    violation_type_description = Column(Text, nullable=True)
    norm_reference = Column(String, nullable=True)
    recommended_act_text = Column(Text, nullable=True)
    requirements = Column(JSON, nullable=True)
    ai_classification = Column(JSON, nullable=True)
    ai_recommendations = Column(JSON, nullable=True)
    ai_payload_raw = Column(JSON, nullable=True)
    location = Column(String, nullable=True)  # Место обнаружения
    deadline = Column(DateTime, nullable=True, index=True)  # Срок устранения
    status = Column(String, default="open", index=True)  # open, resolved
    resolved_at = Column(DateTime, nullable=True)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    
    # Relationships
    inspection = relationship("Inspection", back_populates="violations")
    equipment = relationship("Equipment", back_populates="violations")
    files = relationship("File", back_populates="violation", foreign_keys="File.violation_id")
    acts = relationship("ActViolation", back_populates="violation")
    reporter = relationship("User", foreign_keys=[reported_by], lazy="joined")

# БЛОК 7: Предписания и акты
class Act(Base):
    __tablename__ = "acts"
    
    id = Column(Integer, primary_key=True, index=True)
    act_number = Column(String, unique=True, index=True)
    act_date = Column(DateTime, default=datetime.utcnow)
    organization = Column(String)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="SET NULL"), nullable=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id", ondelete="SET NULL"), nullable=True)
    status = Column(String, default="draft")  # draft, signed, archived
    inspector_signature = Column(Text, nullable=True)
    organization_signature = Column(Text, nullable=True)
    content = Column(Text, nullable=True)  # Сгенерированный текст
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.id"))
    
    # Relationships
    violations = relationship("ActViolation", back_populates="act", cascade="all, delete-orphan")
    files = relationship("File", back_populates="act", foreign_keys="File.act_id")

class ActViolation(Base):
    __tablename__ = "act_violations"
    
    id = Column(Integer, primary_key=True, index=True)
    act_id = Column(Integer, ForeignKey("acts.id", ondelete="CASCADE"))
    violation_id = Column(Integer, ForeignKey("violations.id", ondelete="CASCADE"))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    act = relationship("Act", back_populates="violations")
    violation = relationship("Violation", back_populates="acts")

# БЛОК 8: База знаний
class KnowledgeBase(Base):
    __tablename__ = "knowledge_base"
    
    id = Column(Integer, primary_key=True, index=True)
    document_type = Column(String, index=True)  # fnp461, gost, manual
    section = Column(String, nullable=True)
    clause_number = Column(String, nullable=True)
    title = Column(String)
    content = Column(Text)
    tags = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# БЛОК 9: Файлы
class File(Base):
    __tablename__ = "files"
    
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    original_filename = Column(String)
    file_type = Column(String)  # photo, pdf, video, document
    mime_type = Column(String)
    file_size = Column(Integer)
    file_path = Column(String)
    thumbnail_path = Column(String, nullable=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id", ondelete="CASCADE"), nullable=True)
    violation_id = Column(Integer, ForeignKey("violations.id", ondelete="CASCADE"), nullable=True)
    act_id = Column(Integer, ForeignKey("acts.id", ondelete="CASCADE"), nullable=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    permit_id = Column(Integer, ForeignKey("permits.id", ondelete="CASCADE"), nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    equipment = relationship("Equipment", back_populates="files")
    violation = relationship("Violation", back_populates="files")
    act = relationship("Act", back_populates="files", foreign_keys=[act_id])
    task = relationship("Task", back_populates="files")
    permit = relationship("Permit", back_populates="files")

# БЛОК 10: Audit Log (используем UserActivity, но расширим)
# Уже реализовано в UserActivity

# БЛОК 11: Настройки
class SystemSettings(Base):
    __tablename__ = "system_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    value = Column(Text)
    description = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)

# БЛОК 12: Refresh токены
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    expires_at = Column(DateTime, nullable=False)
    is_revoked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User")

# БЛОК 13: Задачи
class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=True)
    violation_id = Column(Integer, ForeignKey("violations.id", ondelete="SET NULL"), nullable=True)
    assignee_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="open", index=True)
    priority = Column(String, default="medium")
    due_date = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    estimated_hours = Column(Float, nullable=True)
    actual_hours = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    
    equipment = relationship("Equipment")
    violation = relationship("Violation")
    assignee = relationship("User", foreign_keys=[assignee_id])
    creator = relationship("User", foreign_keys=[created_by])
    files = relationship("File", back_populates="task", foreign_keys="File.task_id")

# БЛОК 14: Разрешения на работы
class Permit(Base):
    __tablename__ = "permits"
    
    id = Column(Integer, primary_key=True, index=True)
    permit_number = Column(String, unique=True, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"))
    work_type = Column(String, index=True)
    description = Column(Text, nullable=False)
    responsible_person = Column(String, nullable=False)
    responsible_organization = Column(String, nullable=True)
    safety_measures = Column(Text, nullable=True)
    status = Column(String, default="pending", index=True)
    requested_by = Column(Integer, ForeignKey("users.id"))
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    actual_start = Column(DateTime, nullable=True)
    actual_end = Column(DateTime, nullable=True)
    approval_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    
    equipment = relationship("Equipment")
    requester = relationship("User", foreign_keys=[requested_by])
    approver = relationship("User", foreign_keys=[approved_by])
    files = relationship("File", back_populates="permit", foreign_keys="File.permit_id")

# БЛОК 15: Уведомления
class Notification(Base):
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String, index=True)
    entity_type = Column(String, nullable=True)
    entity_id = Column(Integer, nullable=True)
    is_read = Column(Boolean, default=False, index=True)
    priority = Column(String, default="normal")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    read_at = Column(DateTime, nullable=True)
    
    user = relationship("User")

# БЛОК 16: Кэш аналитики
class AnalyticsCache(Base):
    __tablename__ = "analytics_cache"
    
    id = Column(Integer, primary_key=True, index=True)
    cache_key = Column(String, unique=True, index=True)
    data = Column(JSON, nullable=True)
    expires_at = Column(DateTime, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# БЛОК 17: Отчёты
class Report(Base):
    __tablename__ = "reports"
    
    id = Column(Integer, primary_key=True, index=True)
    report_type = Column(String, index=True)
    title = Column(String, nullable=False)
    parameters = Column(JSON, nullable=True)
    file_path = Column(String, nullable=True)
    file_format = Column(String, nullable=False)
    status = Column(String, default="generating", index=True)
    generated_by = Column(Integer, ForeignKey("users.id"))
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    completed_at = Column(DateTime, nullable=True)
    
    generator = relationship("User")

