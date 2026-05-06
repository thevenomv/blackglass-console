"""Application configuration — all settings loaded from environment variables."""

from __future__ import annotations

from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # -------------------------------------------------------------------------
    # Application
    # -------------------------------------------------------------------------
    app_env: Literal["development", "staging", "production"] = Field(default="development")
    port: int = Field(default=8080)
    debug: bool = Field(default=False)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(default="INFO")

    # -------------------------------------------------------------------------
    # Security
    # -------------------------------------------------------------------------
    blackglass_webhook_secret: SecretStr | None = Field(
        default=None,
        description="HMAC-SHA256 secret for verifying incoming BLACKGLASS webhooks",
    )
    api_secret_key: SecretStr = Field(
        default=SecretStr("change-me-in-production"),
        description="Internal API secret for service-to-service auth",
    )

    # -------------------------------------------------------------------------
    # Database
    # -------------------------------------------------------------------------
    database_url: str = Field(
        default="postgresql+asyncpg://remediator:remediator@localhost:5432/remediator"
    )
    db_pool_size: int = Field(default=10)
    db_max_overflow: int = Field(default=5)

    # -------------------------------------------------------------------------
    # Redis (optional)
    # -------------------------------------------------------------------------
    redis_url: str | None = Field(default=None)

    # -------------------------------------------------------------------------
    # LLM / Agent
    # -------------------------------------------------------------------------
    llm_provider: Literal["ollama", "openai", "anthropic"] = Field(default="ollama")
    ollama_base_url: str = Field(default="http://localhost:11434")
    ollama_model: str = Field(default="llama3.2:3b")
    openai_api_key: SecretStr | None = Field(default=None)
    anthropic_api_key: SecretStr | None = Field(default=None)
    llm_temperature: float = Field(default=0.1, ge=0.0, le=1.0)
    llm_max_retries: int = Field(default=3)

    # -------------------------------------------------------------------------
    # DigitalOcean
    # -------------------------------------------------------------------------
    digitalocean_token: SecretStr | None = Field(default=None)
    do_region: str = Field(default="nyc3")
    default_sandbox_image: str = Field(default="ubuntu-22-04-x64")
    default_sandbox_size: str = Field(default="s-1vcpu-1gb")
    sandbox_ttl_hours: int = Field(default=2)

    # -------------------------------------------------------------------------
    # BLACKGLASS integration
    # -------------------------------------------------------------------------
    blackglass_api_base_url: str = Field(default="http://localhost:3000")
    blackglass_api_token: SecretStr | None = Field(default=None)

    # -------------------------------------------------------------------------
    # Features
    # -------------------------------------------------------------------------
    enable_sandbox_verification: bool = Field(default=False)
    max_remediation_commands: int = Field(default=10)
    recommendation_expiry_hours: int = Field(default=72)

    # -------------------------------------------------------------------------
    # Observability
    # -------------------------------------------------------------------------
    sentry_dsn: str | None = Field(default=None)
    otel_endpoint: str | None = Field(default=None)

    @field_validator("database_url")
    @classmethod
    def validate_db_url(cls, v: str) -> str:
        if not v.startswith(("postgresql", "sqlite")):
            raise ValueError("DATABASE_URL must use postgresql or sqlite scheme")
        return v

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


_settings: Settings | None = None


def get_settings() -> Settings:
    """Return a cached Settings instance."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
