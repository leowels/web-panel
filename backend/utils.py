from passlib.context import CryptContext
import bcrypt

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    # bcrypt ограничивает пароли 72 байтами
    # Обрезаем пароль если он слишком длинный
    if len(password.encode('utf-8')) > 72:
        password = password[:72]
    return pwd_context.hash(password)

