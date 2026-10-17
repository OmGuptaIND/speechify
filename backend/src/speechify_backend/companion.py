"""Ephemeral, authenticated extension presence for the Mac companion app."""

import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field


class Presence(BaseModel):
    version: str = Field(min_length=1, max_length=32, pattern=r"^[0-9.]+$")


def companion_router(authorize):
    router = APIRouter(prefix="/v1/companion", dependencies=[Depends(authorize)])
    last_seen = None
    version = None

    @router.post("")
    def heartbeat(presence: Presence):
        nonlocal last_seen, version
        last_seen, version = time.monotonic(), presence.version
        return {"status": "ok"}

    @router.get("")
    def status():
        age = None if last_seen is None else max(0, time.monotonic() - last_seen)
        return {
            "extension_connected": age is not None and age < 75,
            "last_seen_seconds": None if age is None else round(age),
            "extension_version": version,
        }

    return router
