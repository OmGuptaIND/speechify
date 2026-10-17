import asyncio
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest

from speechify_backend.config import Settings
from speechify_backend.schemas import SpeechRequest
from speechify_backend.service import BusyError, SpeechService


def test_cancelling_request_keeps_busy_slot_until_actual_work_finishes(monkeypatch, tmp_path):
    started, finish = Event(), Event()

    def work(*args):
        started.set()
        finish.wait(timeout=3)
        return {}

    monkeypatch.setattr("speechify_backend.service.synthesize", work)

    async def scenario():
        service = SpeechService(Settings(data_dir=tmp_path))
        service.pool = ThreadPoolExecutor(max_workers=1)
        request = SpeechRequest(text="A short passage.")
        task = asyncio.create_task(service.speak(request))
        await asyncio.to_thread(started.wait, 1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        with pytest.raises(BusyError):
            await service.speak(request)
        finish.set()
        for _ in range(20):
            if not service.busy:
                break
            await asyncio.sleep(0.01)
        assert not service.busy
        await service.close()

    asyncio.run(scenario())


def test_idle_worker_is_retired(tmp_path):
    async def scenario():
        service = SpeechService(Settings(data_dir=tmp_path, idle_seconds=0))
        pool = ThreadPoolExecutor(max_workers=1)
        service.pool = pool
        await service.unload_if_idle()
        assert service.pool is None
        with pytest.raises(RuntimeError):
            pool.submit(lambda: None)

    asyncio.run(scenario())
