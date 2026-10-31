from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Reads ../.env (repo root) when run from backend/, or .env in the cwd.
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    database_url: str = "postgresql+psycopg://brightloop:brightloop@localhost:5432/brightloop"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 480
    cookie_secure: bool = False
    cors_origins: str = "http://localhost:5173"
    frontend_url: str = "http://localhost:5173"


settings = Settings()
