from typing import Literal

from pydantic import BaseModel, Field, field_validator

Voice = Literal["af_bella", "af_heart", "af_nicole"]


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=240)
    voice: Voice = "af_bella"

    @field_validator("text")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Choose a passage containing words.")
        return value


class WordTiming(BaseModel):
    text: str
    start_char: int
    end_char: int
    start: float
    end: float


class SpeechResponse(BaseModel):
    audio: str
    mime_type: str = "audio/wav"
    duration: float
    sample_rate: int
    words: list[WordTiming]
    alignment: Literal["model-phonemes"] = "model-phonemes"
    generation_ms: int
