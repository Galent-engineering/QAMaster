from fastapi import FastAPI
from routers import workflows
from routers.agents import router as agent_router

app = FastAPI(title="Demo")
app.include_router(workflows.router, prefix="/api/v1")
app.include_router(agent_router, prefix="/v2")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/status")
def status():
    return {"up": True}
