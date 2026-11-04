from fastapi import APIRouter

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.get("/")
def list_workflows():
    return []


@router.get("/{workflow_id}")
def get_workflow(workflow_id: str):
    return {}


@router.post("/{workflow_id}/approvals")
def approve(workflow_id: str):
    return {}


@router.put("/{workflow_id}")
def replace(workflow_id: str):
    return {}


@router.patch("/{workflow_id}/assignments/{assignment_id}/claim")
def claim(workflow_id: str, assignment_id: str):
    return {}


@router.delete("/{workflow_id}")
def remove(workflow_id: str):
    return {}
