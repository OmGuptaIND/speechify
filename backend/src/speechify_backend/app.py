import argparse
import asyncio
import hmac
import re
from contextlib import asynccontextmanager, suppress

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .companion import companion_router
from .config import Settings, connection_key
from .runtime import backend_lock
from .schemas import SpeechRequest, SpeechResponse
from .service import BusyError, SpeechService


def create_app(settings=None, service=None, key=None):
    settings = settings or Settings()
    key = key or connection_key(settings)
    service = service or SpeechService(settings)

    @asynccontextmanager
    async def lifespan(app):
        async def retire_idle_worker():
            while True:
                await asyncio.sleep(10)
                await service.unload_if_idle()

        monitor = asyncio.create_task(retire_idle_worker())
        try:
            yield
        finally:
            monitor.cancel()
            with suppress(asyncio.CancelledError):
                await monitor
            await service.close()

    app = FastAPI(title="Speechify local reader", version="0.1.0", lifespan=lifespan)
    app.state.speech = service
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"]
    )
    preview_origins = ["http://127.0.0.1:8768"] if settings.preview else []
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"chrome-extension://[a-p]{32}",
        allow_origins=preview_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def local_requests(request: Request, call_next):
        origin = request.headers.get("origin")
        allowed = (
            not origin
            or re.fullmatch(r"chrome-extension://[a-p]{32}", origin)
            or origin in preview_origins
        )
        if not allowed:
            return JSONResponse({"detail": "This origin is not allowed."}, status_code=403)
        try:
            if int(request.headers.get("content-length", "0")) > 8192:
                return JSONResponse({"detail": "The request is too large."}, status_code=413)
        except ValueError:
            return JSONResponse({"detail": "Invalid content length."}, status_code=400)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    def authorize(authorization: str = Header(default="")):
        supplied = authorization.removeprefix("Bearer ")
        if not hmac.compare_digest(supplied.encode(), key.encode()):
            raise HTTPException(401, "Connect using this Mac's Speechify connection key.")

    app.include_router(companion_router(authorize))

    @app.get("/", response_class=HTMLResponse)
    def home():
        return "<title>Speechify</title><h1>Your local reader is running.</h1><p>Open the Speechify extension to read with Bella.</p>"

    @app.get("/v1/health")
    def health():
        return {
            "app": "speechify-local-reader",
            "status": "ok",
            "models_ready": settings.models_ready,
            "worker_loaded": service.pool is not None,
            "busy": service.busy,
            "idle_unload_seconds": settings.idle_seconds,
        }

    @app.get("/v1/voices", dependencies=[Depends(authorize)])
    def voices():
        return [
            {"id": "af_bella", "name": "Bella"},
            {"id": "af_heart", "name": "Heart"},
            {"id": "af_nicole", "name": "Nicole"},
        ]

    @app.post("/v1/speech", response_model=SpeechResponse, dependencies=[Depends(authorize)])
    async def speech(request: SpeechRequest):
        if not settings.models_ready:
            raise HTTPException(
                503, "The voice files are missing. Open Speechify and choose Prepare this Mac."
            )
        try:
            return await service.speak(request)
        except BusyError:
            raise HTTPException(
                409,
                "Bella is preparing another section. Try again shortly.",
                headers={"Retry-After": "1"},
            ) from None
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        except Exception:
            raise HTTPException(
                500, "Bella could not prepare this passage. Restart the local reader and try again."
            ) from None

    return app


def main():
    import uvicorn

    parser = argparse.ArgumentParser(description="Run the local Speechify backend.")
    parser.add_argument(
        "--preview", action="store_true", help="Also allow the local UI preview on port 8768."
    )
    parser.add_argument(
        "--quiet-key", action="store_true", help="Keep the pairing key out of background logs."
    )
    parser.add_argument("--port", type=int, default=8767, help="Loopback port (default: 8767).")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("The port must be between 1 and 65535.")
    settings = Settings(preview=args.preview, port=args.port)
    key = connection_key(settings)
    print(f"\nSpeechify is local to this Mac · http://127.0.0.1:{settings.port}")
    if not args.quiet_key:
        print("Paste this connection key into the extension once:")
        print(f"\n{key}\n")
    print(
        "Bella uses two inference threads and unloads after three idle minutes. Control-C stops the reader.\n"
    )
    try:
        with backend_lock(settings):
            uvicorn.run(
                create_app(settings, key=key),
                host="127.0.0.1",
                port=settings.port,
                access_log=False,
            )
    except RuntimeError as error:
        parser.exit(1, f"Speechify: {error}\n")


if __name__ == "__main__":
    main()
