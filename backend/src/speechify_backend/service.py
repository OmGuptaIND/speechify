import asyncio
import multiprocessing
import time
from concurrent.futures import ProcessPoolExecutor

from .worker import initialize_worker, synthesize


class BusyError(Exception):
    pass


class SpeechService:
    def __init__(self, settings):
        self.settings = settings
        self.pool = None
        self.busy = False
        self.last_used = time.monotonic()

    async def speak(self, request):
        if self.busy:
            raise BusyError
        if self.pool is None:
            self.pool = ProcessPoolExecutor(
                max_workers=1,
                mp_context=multiprocessing.get_context("spawn"),
                initializer=initialize_worker,
            )
        self.busy = True
        loop = asyncio.get_running_loop()
        try:
            future = loop.run_in_executor(
                self.pool,
                synthesize,
                request.text,
                request.voice,
                str(self.settings.models_dir),
                self.settings.threads,
            )
        except BaseException:
            self.busy = False
            raise

        def complete(finished):
            if not finished.cancelled():
                finished.exception()
            self.busy = False
            self.last_used = time.monotonic()

        future.add_done_callback(complete)
        # A browser disconnect must not free this slot while inference still runs.
        return await asyncio.shield(future)

    async def unload_if_idle(self):
        if (
            self.pool is not None
            and not self.busy
            and time.monotonic() - self.last_used >= self.settings.idle_seconds
        ):
            await self.close()

    async def close(self):
        pool, self.pool = self.pool, None
        if pool is not None:
            await asyncio.to_thread(pool.shutdown, wait=True, cancel_futures=True)
