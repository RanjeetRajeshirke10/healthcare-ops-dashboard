"""
FastAPI app entrypoint. Loads all CSVs into memory once at startup (via the
lifespan handler below), wires up CORS for the Vite dev server, and includes
every router. Run from the repo root:

    .venv\\Scripts\\uvicorn backend.main:app --reload
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .data_loader import load_data
from .routers import access, ancillary, data_quality, filters, overview, productivity


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.data_store = load_data()
    yield


app = FastAPI(
    title="Healthcare Operations Analytics API",
    description="Serves aggregated KPIs from the synthetic Phase 1 dataset for the ops dashboard frontend.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(filters.router, prefix="/api/filters", tags=["filters"])
app.include_router(access.router, prefix="/api/access", tags=["access"])
app.include_router(productivity.router, prefix="/api/productivity", tags=["productivity"])
app.include_router(ancillary.router, prefix="/api/ancillary", tags=["ancillary"])
app.include_router(data_quality.router, prefix="/api/data-quality", tags=["data-quality"])
app.include_router(overview.router, prefix="/api/overview", tags=["overview"])


@app.get("/api/health", tags=["health"])
def health_check() -> dict:
    return {"status": "ok"}
