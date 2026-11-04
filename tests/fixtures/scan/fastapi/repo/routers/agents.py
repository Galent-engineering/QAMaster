from fastapi import APIRouter, Depends

router = APIRouter(prefix="/agents", dependencies=[Depends(lambda: None)])


@router.get(
    "/{agent_id}",
)
def get_agent(agent_id: str):
    return {}


@router.delete("/{agent_id}")
def delete_agent(agent_id: str):
    return {}
