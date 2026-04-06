from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, ForeignKey, Float, JSON, UniqueConstraint, LargeBinary
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4

Base = declarative_base()

# Р вЂР вЂєР С›Р С™ 2: Р СџР С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљР ВµР В»Р С‘ Р С‘ РЎР‚Р С•Р В»Р С‘
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String)
    organization = Column(String)
    signature = Column(Text)  # Р СџР С•Р Т‘Р С—Р С‘РЎРѓРЎРЉ Р Т‘Р В»РЎРЏ Р В°Р С”РЎвЂљР С•Р Р†
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    telegram_user_id = Column(String, unique=True, index=True, nullable=True)
    
    # Relationships
    roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan", foreign_keys="UserRole.user_id")
    activities = relationship("UserActivity", back_populates="user", cascade="all, delete-orphan")

class Role(Base):
    __tablename__ = "roles"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)  # admin, inspector, viewer
    description = Column(String)
    permissions = Column(JSON)  # Р РЋР С—Р С‘РЎРѓР С•Р С” РЎР‚Р В°Р В·РЎР‚Р ВµРЎв‚¬Р ВµР Р…Р С‘Р в„–
    
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


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    entity_type = Column(String(64), nullable=False, index=True)
    entity_id = Column(String(64), nullable=False, index=True)
    action = Column(String(32), nullable=False, index=True)
    field_changes = Column(JSON, nullable=True)
    performed_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    performed_at = Column(DateTime, default=datetime.utcnow, index=True)
    source = Column(String(32), nullable=False, default="ui", index=True)
    trace_id = Column(String(36), nullable=True, index=True)

    user = relationship("User", foreign_keys=[performed_by])

# Р вЂР вЂєР С›Р С™ 3: Р РЋР С—РЎР‚Р В°Р Р†Р С•РЎвЂЎР Р…Р С‘Р С” Р С•Р В±Р С•РЎР‚РЎС“Р Т‘Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ (Р СџР РЋ)
class Equipment(Base):
    __tablename__ = "equipment"
    
    id = Column(Integer, primary_key=True, index=True)
    equipment_type = Column(String, index=True)  # Р СћР С‘Р С— Р СџР РЋ
    passport_number = Column(String, unique=True, index=True)  # Р СџР В°РЎРѓР С—Р С•РЎР‚РЎвЂљ
    registration_number = Column(String, nullable=True, index=True)  # Регистрационный номер
    factory_number = Column(String, nullable=True, index=True)  # Заводской номер
    inventory_number = Column(String, unique=True, index=True, nullable=True)  # Р ВР Р…Р Р†Р ВµР Р…РЎвЂљР В°РЎР‚Р Р…РЎвЂ№Р в„– Р Р…Р С•Р СР ВµРЎР‚
    position = Column(String, nullable=True, index=True)  # Р СџР С•Р В·Р С‘РЎвЂ Р С‘РЎРЏ
    workshop = Column(String, nullable=True, index=True)  # Р В¦Р ВµРЎвЂ¦
    load_capacity = Column(Float, nullable=True)  # Р вЂњРЎР‚РЎС“Р В·Р С•Р С—Р С•Р Т‘РЎР‰Р ВµР СР Р…Р С•РЎРѓРЎвЂљРЎРЉ
    manufacturer = Column(String, nullable=True)  # Р вЂ”Р В°Р Р†Р С•Р Т‘
    installation_date = Column(DateTime, nullable=True)  # Р вЂќР В°РЎвЂљР В° Р Р†Р Р†Р С•Р Т‘Р В°
    pto_date = Column(DateTime, nullable=True, index=True)  # Р вЂќР В°РЎвЂљР В° Р СџР СћР С›
    cto_date = Column(DateTime, nullable=True, index=True)  # Р вЂќР В°РЎвЂљР В° Р В§Р СћР С›
    installation_location = Column(String, nullable=True)  # Р СљР ВµРЎРѓРЎвЂљР С• РЎС“РЎРѓРЎвЂљР В°Р Р…Р С•Р Р†Р С”Р С‘
    rostekhnadzor_registered = Column(Boolean, default=False, index=True)  # Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅРѕ РІ Р РѕСЃС‚РµС…РЅР°РґР·РѕСЂРµ
    expertise_date = Column(DateTime, nullable=True, index=True)  # Дата экспертизы
    operation_permit_until = Column(DateTime, nullable=True, index=True)  # Срок эксплуатации по экспертизе
    operation_banned = Column(Boolean, default=False, index=True)  # Запрет на эксплуатацию
    epb_positive_details = Column(Text, nullable=True)  # Реквизиты положительной ЭПБ
    status = Column(String, default="active", index=True)  # active, inactive, archived
    map_x = Column(Float, nullable=True)  # Р С™Р С•Р С•РЎР‚Р Т‘Р С‘Р Р…Р В°РЎвЂљР В° X Р Р…Р В° Р С”Р В°РЎР‚РЎвЂљР Вµ (0-100%)
    map_y = Column(Float, nullable=True)  # Р С™Р С•Р С•РЎР‚Р Т‘Р С‘Р Р…Р В°РЎвЂљР В° Y Р Р…Р В° Р С”Р В°РЎР‚РЎвЂљР Вµ (0-100%)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    files = relationship("File", back_populates="equipment", foreign_keys="File.equipment_id")
    inspections = relationship("Inspection", back_populates="equipment")
    violations = relationship("Violation", back_populates="equipment")
    history = relationship("EquipmentHistory", back_populates="equipment", cascade="all, delete-orphan")
    passport = relationship("EquipmentPassport", back_populates="equipment", uselist=False, cascade="all, delete-orphan")

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


class EquipmentPassport(Base):
    __tablename__ = "equipment_passports"
    __table_args__ = (
        UniqueConstraint("equipment_id", name="uq_equipment_passports_equipment"),
    )

    id = Column(Integer, primary_key=True, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)
    passport_status = Column(String, default="draft", index=True)  # draft, review, approved, archived
    draft_data = Column(JSON, nullable=True)
    completeness_percent = Column(Float, default=0.0)
    current_version_id = Column(Integer, nullable=True, index=True)
    last_published_at = Column(DateTime, nullable=True, index=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    equipment = relationship("Equipment", back_populates="passport")
    approver = relationship("User", foreign_keys=[approved_by])
    updater = relationship("User", foreign_keys=[updated_by])
    versions = relationship("EquipmentPassportVersion", back_populates="passport", cascade="all, delete-orphan")
    documents = relationship("EquipmentPassportDocument", back_populates="passport", cascade="all, delete-orphan")
    events = relationship("EquipmentPassportEvent", back_populates="passport", cascade="all, delete-orphan")


class EquipmentPassportVersion(Base):
    __tablename__ = "equipment_passport_versions"
    __table_args__ = (
        UniqueConstraint("passport_id", "version_number", name="uq_equipment_passport_versions"),
    )

    id = Column(Integer, primary_key=True, index=True)
    passport_id = Column(Integer, ForeignKey("equipment_passports.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    status = Column(String, default="approved", index=True)
    snapshot = Column(JSON, nullable=False)
    change_summary = Column(Text, nullable=True)
    pdf_file_id = Column(Integer, ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    passport = relationship("EquipmentPassport", back_populates="versions")
    creator = relationship("User", foreign_keys=[created_by])
    pdf_file = relationship("File", foreign_keys=[pdf_file_id])


class EquipmentPassportDocument(Base):
    __tablename__ = "equipment_passport_documents"

    id = Column(Integer, primary_key=True, index=True)
    passport_id = Column(Integer, ForeignKey("equipment_passports.id", ondelete="CASCADE"), nullable=False, index=True)
    file_id = Column(Integer, ForeignKey("files.id", ondelete="SET NULL"), nullable=True, index=True)
    document_type = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    document_number = Column(String, nullable=True, index=True)
    issuer = Column(String, nullable=True)
    issue_date = Column(DateTime, nullable=True, index=True)
    expiry_date = Column(DateTime, nullable=True, index=True)
    status = Column(String, default="active", index=True)
    is_required = Column(Boolean, default=False, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    passport = relationship("EquipmentPassport", back_populates="documents")
    file = relationship("File", foreign_keys=[file_id])
    uploader = relationship("User", foreign_keys=[uploaded_by])


class EquipmentPassportEvent(Base):
    __tablename__ = "equipment_passport_events"

    id = Column(Integer, primary_key=True, index=True)
    passport_id = Column(Integer, ForeignKey("equipment_passports.id", ondelete="CASCADE"), nullable=False, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    event_date = Column(DateTime, default=datetime.utcnow, index=True)
    source = Column(String, default="manual", index=True)  # manual, system, ai
    related_entity_type = Column(String, nullable=True, index=True)
    related_entity_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    passport = relationship("EquipmentPassport", back_populates="events")
    equipment = relationship("Equipment")
    creator = relationship("User", foreign_keys=[created_by])

# Р вЂР вЂєР С›Р С™ 4: Р В§Р ВµР С”-Р В»Р С‘РЎРѓРЎвЂљРЎвЂ№
class ChecklistTemplate(Base):
    __tablename__ = "checklist_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    equipment_type = Column(String, nullable=True)  # Р СџРЎР‚Р С‘Р Р†РЎРЏР В·Р С”Р В° Р С” РЎвЂљР С‘Р С—РЎС“ Р СџР РЋ
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
    options = Column(JSON, nullable=True)  # Р вЂќР В»РЎРЏ select РЎвЂљР С‘Р С—Р В°
    validation_rules = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    template = relationship("ChecklistTemplate", back_populates="items")
    answers = relationship("InspectionAnswer", back_populates="item")

# Р вЂР вЂєР С›Р С™ 5: Р С›РЎРѓР СР С•РЎвЂљРЎР‚РЎвЂ№
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
    is_synced = Column(Boolean, default=True)  # Р вЂќР В»РЎРЏ Р С•РЎвЂћРЎвЂћР В»Р В°Р в„–Р Р… РЎР‚Р ВµР В¶Р С‘Р СР В°
    
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
    value = Column(Text, nullable=True)  # JSON Р Т‘Р В»РЎРЏ РЎРѓР В»Р С•Р В¶Р Р…РЎвЂ№РЎвЂ¦ РЎвЂљР С‘Р С—Р С•Р Р†
    file_id = Column(Integer, ForeignKey("files.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    inspection = relationship("Inspection", back_populates="answers")
    item = relationship("ChecklistItem", back_populates="answers")
    file = relationship("File", foreign_keys=[file_id])


# Р‘Р›РћРљ 6.0: SLA РїСЂР°РІРёР»Р° РїРѕ РЅР°СЂСѓС€РµРЅРёСЏРј
class ViolationSLARule(Base):
    __tablename__ = "violation_sla_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    violation_type = Column(String, nullable=True, index=True)
    severity = Column(String, nullable=True, index=True)  # low, medium, high, critical
    days = Column(Integer, nullable=False)
    priority = Column(Integer, default=100, index=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DefectNode(Base):
    __tablename__ = "defect_nodes"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=False)
    recommendation = Column(Text, nullable=True)
    severity = Column(String, default="medium", index=True)  # low, medium, high, critical
    position = Column(String, nullable=False)  # model-viewer hotspot position
    normal = Column(String, nullable=True)  # model-viewer hotspot normal
    hotspot_size = Column(Float, nullable=True)
    sort_order = Column(Integer, default=100, index=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    violations = relationship("Violation", back_populates="defect_node")

# Р вЂР вЂєР С›Р С™ 6: Р СњР В°РЎР‚РЎС“РЎв‚¬Р ВµР Р…Р С‘РЎРЏ
class Violation(Base):
    __tablename__ = "violations"
    
    id = Column(Integer, primary_key=True, index=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id", ondelete="SET NULL"), nullable=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), index=True)
    defect_node_id = Column(Integer, ForeignKey("defect_nodes.id", ondelete="SET NULL"), nullable=True, index=True)
    source = Column(String, nullable=True)  # telegram, web, etc.
    reported_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    attachment_meta = Column(JSON, nullable=True)
    description = Column(Text)
    fnp_clause = Column(String, nullable=True)  # Р СџРЎС“Р Р…Р С”РЎвЂљ Р В¤Р СњР Сџ 461
    gost_clause = Column(String, nullable=True)  # Р СџРЎС“Р Р…Р С”РЎвЂљ Р вЂњР С›Р РЋР Сћ
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
    location = Column(String, nullable=True)  # Р СљР ВµРЎРѓРЎвЂљР С• Р С•Р В±Р Р…Р В°РЎР‚РЎС“Р В¶Р ВµР Р…Р С‘РЎРЏ
    deadline = Column(DateTime, nullable=True, index=True)  # Р РЋРЎР‚Р С•Р С” РЎС“РЎРѓРЎвЂљРЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ
    deadline_source = Column(String, nullable=True)  # manual, sla, sla_default, ai
    deadline_rule_id = Column(Integer, nullable=True)
    is_overdue = Column(Boolean, default=False, index=True)
    overdue_at = Column(DateTime, nullable=True)
    status = Column(String, default="open", index=True)  # open, resolved
    resolved_at = Column(DateTime, nullable=True)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    
    # Relationships
    inspection = relationship("Inspection", back_populates="violations")
    equipment = relationship("Equipment", back_populates="violations")
    defect_node = relationship("DefectNode", back_populates="violations")
    files = relationship("File", back_populates="violation", foreign_keys="File.violation_id")
    acts = relationship("ActViolation", back_populates="violation")
    reporter = relationship("User", foreign_keys=[reported_by], lazy="joined")


class TelegramIngestEvent(Base):
    __tablename__ = "telegram_ingest_events"

    id = Column(Integer, primary_key=True, index=True)
    event_key = Column(String, unique=True, nullable=False, index=True)
    violation_id = Column(Integer, ForeignKey("violations.id", ondelete="CASCADE"), nullable=False, index=True)
    telegram_chat_id = Column(String, nullable=True, index=True)
    telegram_message_id = Column(String, nullable=True, index=True)
    telegram_user_id = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

# Р вЂР вЂєР С›Р С™ 7: Р СџРЎР‚Р ВµР Т‘Р С—Р С‘РЎРѓР В°Р Р…Р С‘РЎРЏ Р С‘ Р В°Р С”РЎвЂљРЎвЂ№
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
    content = Column(Text, nullable=True)  # Р РЋР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р Р…РЎвЂ№Р в„– РЎвЂљР ВµР С”РЎРѓРЎвЂљ
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

# Р вЂР вЂєР С›Р С™ 8: Р вЂР В°Р В·Р В° Р В·Р Р…Р В°Р Р…Р С‘Р в„–
class KnowledgeBase(Base):
    __tablename__ = "knowledge_base"
    
    id = Column(Integer, primary_key=True, index=True)
    document_type = Column(String, index=True)  # fnp461, gost, manual
    section = Column(String, nullable=True)
    clause_number = Column(String, nullable=True)
    title = Column(String)
    content = Column(Text)
    tags = Column(JSON, nullable=True)
    embedding = Column(JSON, nullable=True)
    embedding_model = Column(String, nullable=True)
    embedding_updated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Р вЂР вЂєР С›Р С™ 9: Р В¤Р В°Р в„–Р В»РЎвЂ№
class File(Base):
    __tablename__ = "files"
    
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    original_filename = Column(String)
    description = Column(Text, nullable=True)
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

# Р вЂР вЂєР С›Р С™ 10: Audit Log (Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµР С UserActivity, Р Р…Р С• РЎР‚Р В°РЎРѓРЎв‚¬Р С‘РЎР‚Р С‘Р С)
# Р Р€Р В¶Р Вµ РЎР‚Р ВµР В°Р В»Р С‘Р В·Р С•Р Р†Р В°Р Р…Р С• Р Р† UserActivity

# Р вЂР вЂєР С›Р С™ 11: Р СњР В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”Р С‘
class SystemSettings(Base):
    __tablename__ = "system_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    value = Column(Text)
    description = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)

# Р вЂР вЂєР С›Р С™ 11.1: Р С™Р В°РЎР‚РЎвЂљР В° РЎвЂ Р ВµРЎвЂ¦Р В° (Р С”Р С•Р Р…РЎвЂћР С‘Р С–РЎС“РЎР‚Р В°РЎвЂ Р С‘РЎРЏ)
class WorkshopMap(Base):
    __tablename__ = "workshop_maps"
    
    id = Column(Integer, primary_key=True, index=True)
    workshop = Column(String, unique=True, index=True)
    data = Column(JSON, nullable=False)  # РЎРЊР В»Р ВµР СР ВµР Р…РЎвЂљРЎвЂ№ Р С”Р В°РЎР‚РЎвЂљРЎвЂ№ + Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”Р С‘
    background_path = Column(String, nullable=True)  # Р С—РЎС“РЎвЂљРЎРЉ Р С” РЎвЂћР С•Р Р…РЎС“ Р С”Р В°РЎР‚РЎвЂљРЎвЂ№
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)


class WorkshopMapAsset(Base):
    __tablename__ = "workshop_map_assets"

    id = Column(Integer, primary_key=True, index=True)
    storage_key = Column(String, unique=True, index=True, nullable=False)
    original_filename = Column(String, nullable=True)
    content_type = Column(String, nullable=False)
    data = Column(LargeBinary, nullable=False)
    byte_size = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)

# Р вЂР вЂєР С›Р С™ 12: Refresh РЎвЂљР С•Р С”Р ВµР Р…РЎвЂ№
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

# Р вЂР вЂєР С›Р С™ 13: Р вЂ”Р В°Р Т‘Р В°РЎвЂЎР С‘
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

# Р вЂР вЂєР С›Р С™ 14: Р В Р В°Р В·РЎР‚Р ВµРЎв‚¬Р ВµР Р…Р С‘РЎРЏ Р Р…Р В° РЎР‚Р В°Р В±Р С•РЎвЂљРЎвЂ№
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

# Р вЂР вЂєР С›Р С™ 15: Р Р€Р Р†Р ВµР Т‘Р С•Р СР В»Р ВµР Р…Р С‘РЎРЏ
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


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "type", name="uq_alert_entity_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String, nullable=False, index=True)
    entity_id = Column(Integer, nullable=False, index=True)
    type = Column(String, nullable=False, index=True)  # SLA_OVERDUE, SLA_WARNING
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    acknowledged_at = Column(DateTime, nullable=True, index=True)


class ErrorEvent(Base):
    __tablename__ = "error_events"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(64), nullable=False, index=True)
    message = Column(Text, nullable=False)
    trace_id = Column(String(36), nullable=False, index=True)
    path = Column(String(255), nullable=True, index=True)
    method = Column(String(16), nullable=True, index=True)
    status_code = Column(Integer, nullable=False, index=True)
    retryable = Column(Boolean, default=False, index=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    resolved_at = Column(DateTime, nullable=True, index=True)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    resolver = relationship("User", foreign_keys=[resolved_by])

# Р вЂР вЂєР С›Р С™ 16: Р С™РЎРЊРЎв‚¬ Р В°Р Р…Р В°Р В»Р С‘РЎвЂљР С‘Р С”Р С‘
class AnalyticsCache(Base):
    __tablename__ = "analytics_cache"
    
    id = Column(Integer, primary_key=True, index=True)
    cache_key = Column(String, unique=True, index=True)
    data = Column(JSON, nullable=True)
    expires_at = Column(DateTime, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# Р вЂР вЂєР С›Р С™ 17: Р С›РЎвЂљРЎвЂЎРЎвЂРЎвЂљРЎвЂ№
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





