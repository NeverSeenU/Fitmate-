from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.api.deps import get_admin_service
from app.config import get_settings
from app.services.admin_service import AdminService


router = APIRouter(prefix="/admin", tags=["admin"])
AdminServiceDependency = Annotated[AdminService, Depends(get_admin_service)]


def require_admin_secret(
    x_fitmate_admin_secret: Annotated[str | None, Header()] = None,
) -> None:
    if x_fitmate_admin_secret != get_settings().admin_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="admin_auth_required")


@router.get("/metrics")
def get_admin_metrics(
    _: Annotated[None, Depends(require_admin_secret)],
    service: AdminServiceDependency,
) -> dict:
    return service.metrics()
