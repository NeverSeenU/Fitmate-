from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_auth_service
from app.services.auth_service import AuthService


router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    display_name: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class PasswordResetRequest(BaseModel):
    email: str


class PasswordResetConfirmRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str | None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class PasswordResetRequestResponse(BaseModel):
    accepted: bool
    debug_reset_token: str | None = None


class PasswordResetConfirmResponse(BaseModel):
    reset: bool


AuthServiceDependency = Annotated[AuthService, Depends(get_auth_service)]


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, service: AuthServiceDependency) -> AuthResponse:
    result = service.register(
        email=payload.email,
        password=payload.password,
        display_name=payload.display_name,
    )
    if result.error == "email_already_registered":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email_already_registered",
        )
    if result.error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.error)
    return AuthResponse(access_token=result.access_token or "", user=UserResponse(**result.user))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, service: AuthServiceDependency) -> AuthResponse:
    result = service.login(email=payload.email, password=payload.password)
    if result.error == "invalid_credentials":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_credentials",
        )
    if result.error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.error)
    return AuthResponse(access_token=result.access_token or "", user=UserResponse(**result.user))


@router.post(
    "/password-reset/request",
    response_model=PasswordResetRequestResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def request_password_reset(
    payload: PasswordResetRequest,
    service: AuthServiceDependency,
) -> PasswordResetRequestResponse:
    token = service.request_password_reset(payload.email)
    return PasswordResetRequestResponse(accepted=True, debug_reset_token=token)


@router.post("/password-reset/confirm", response_model=PasswordResetConfirmResponse)
def confirm_password_reset(
    payload: PasswordResetConfirmRequest,
    service: AuthServiceDependency,
) -> PasswordResetConfirmResponse:
    reset = service.confirm_password_reset(
        token=payload.token,
        new_password=payload.new_password,
    )
    if not reset:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid_or_expired_reset_token",
        )
    return PasswordResetConfirmResponse(reset=True)
