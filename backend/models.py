from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=200)


class RecordIn(BaseModel):
    """Shared validation for creating/updating a pledge record."""

    name: str = Field(..., min_length=1, max_length=150)
    phone: str = Field(..., min_length=1, max_length=20)
    item_name: str = Field(..., min_length=1, max_length=150)
    amount: float = Field(..., ge=0, le=100_000_000)
    net_weight: float = Field(..., ge=0, le=100_000)
    no_of_items: int = Field(default=1, ge=1, le=10_000)
    pledge_date: str = Field(..., min_length=1, max_length=40)
    release_date: Optional[str] = Field(default="", max_length=40)
    locker: Optional[str] = Field(default="", max_length=50)

    @field_validator("phone")
    @classmethod
    def phone_looks_sane(cls, v: str) -> str:
        digits = "".join(ch for ch in v if ch.isdigit())
        if len(digits) < 6:
            raise ValueError("phone number looks invalid")
        return v


class PendingSubmissionIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    phone: str = Field(..., min_length=1, max_length=20)
    item_name: str = Field(..., min_length=1, max_length=150)
    amount: float = Field(..., ge=0, le=100_000_000)
    net_weight: float = Field(..., ge=0, le=100_000)
    no_of_items: int = Field(default=1, ge=1, le=10_000)
    pledge_date: Optional[str] = Field(default=None, max_length=40)
    locker: Optional[str] = Field(default="", max_length=50)
