from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=200)


class RecordIn(BaseModel):
    """Shared validation for creating/updating a pledge record."""

    name: str = Field(..., min_length=1, max_length=150)
    phone: Optional[str] = Field(default=None, max_length=20)
    item_name: Optional[str] = Field(default=None, max_length=150)
    amount: float = Field(..., ge=0, le=100_000_000)
    net_weight: Optional[float] = Field(default=None, ge=0, le=100_000)
    no_of_items: Optional[int] = Field(default=1, ge=0, le=10_000)
    pledge_date: Optional[str] = Field(default=None, min_length=1, max_length=40)
    release_date: Optional[str] = Field(default="", max_length=40)
    locker: Optional[str] = Field(default="", max_length=50)

    @field_validator("pledge_date", mode="before")
    @classmethod
    def normalize_pledge_date(cls, v: object) -> Optional[str]:
        if v is None or v == "":
            return None
        return str(v).strip() or None

    @field_validator("release_date", mode="before")
    @classmethod
    def normalize_release_date(cls, v: object) -> str:
        if v is None or v == "":
            return ""
        return str(v).strip()

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, v: object) -> str:
        if v is None:
            return ""
        return str(v).strip()

    @field_validator("phone")
    @classmethod
    def phone_looks_sane(cls, v: str) -> str:
        if v is None:
            return ""

        cleaned = str(v).strip()
        if not cleaned:
            return ""

        digits = "".join(ch for ch in cleaned if ch.isdigit())
        if not digits:
            return cleaned

        if len(digits) < 3:
            raise ValueError("phone number looks invalid")
        return cleaned


class PendingSubmissionIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    phone: Optional[str] = Field(default=None, max_length=20)
    item_name: Optional[str] = Field(default=None, max_length=150)
    amount: float = Field(..., ge=0, le=100_000_000)
    net_weight: Optional[float] = Field(default=None, ge=0, le=100_000)
    no_of_items: Optional[int] = Field(default=1, ge=0, le=10_000)
    pledge_date: Optional[str] = Field(default=None, min_length=1, max_length=40)
    locker: Optional[str] = Field(default="", max_length=50)

    @field_validator("pledge_date", mode="before")
    @classmethod
    def normalize_pledge_date(cls, v: object) -> Optional[str]:
        if v is None or v == "":
            return None
        return str(v).strip() or None

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, v: object) -> str:
        if v is None:
            return ""
        return str(v).strip()

    @field_validator("phone")
    @classmethod
    def phone_looks_sane(cls, v: str) -> str:
        if v is None:
            return ""

        cleaned = str(v).strip()
        if not cleaned:
            return ""

        digits = "".join(ch for ch in cleaned if ch.isdigit())
        if not digits:
            return cleaned

        if len(digits) < 3:
            raise ValueError("phone number looks invalid")
        return cleaned
