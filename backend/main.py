from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.dashboard import router as dashboard_router
from api.prompts import router as prompts_router
from api.root import router as root_router
from api.runs import router as runs_router
from api.settings import router as settings_router
from api.system import router as system_router
from api.workspaces import router as workspace_router
from config import get_settings


app = FastAPI(title="GeoRank AI Backend")
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(root_router)
app.include_router(workspace_router)
app.include_router(prompts_router)
app.include_router(runs_router)
app.include_router(settings_router)
app.include_router(dashboard_router)
app.include_router(system_router)
