from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import base64
import hashlib
import hmac
import json
import secrets
import uuid

from app.config import get_settings


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


@dataclass
class AuthResult:
    user: dict | None = None
    access_token: str | None = None
    error: str | None = None


@dataclass
class StoredUser:
    id: str
    email: str
    display_name: str | None
    password_hash: str


class InMemoryAuthStore:
    def __init__(self) -> None:
        self.users_by_email: dict[str, StoredUser] = {}
        self.reset_tokens: dict[str, str] = {}

    def create_user(self, email: str, password_hash: str, display_name: str | None) -> StoredUser:
        normalized_email = email.strip().lower()
        if normalized_email in self.users_by_email:
            raise ValueError("email_already_registered")
        user = StoredUser(
            id=str(uuid.uuid4()),
            email=normalized_email,
            display_name=display_name,
            password_hash=password_hash,
        )
        self.users_by_email[normalized_email] = user
        return user

    def get_user_by_email(self, email: str) -> StoredUser | None:
        return self.users_by_email.get(email.strip().lower())

    def get_user_by_id(self, user_id: str) -> StoredUser | None:
        for user in self.users_by_email.values():
            if user.id == user_id:
                return user
        return None

    def update_password(self, email: str, password_hash: str) -> bool:
        user = self.get_user_by_email(email)
        if user is None:
            return False
        self.users_by_email[user.email] = StoredUser(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            password_hash=password_hash,
        )
        return True


class PasswordHasher:
    iterations = 210_000

    def hash_password(self, password: str) -> str:
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            self.iterations,
        )
        return f"pbkdf2_sha256${self.iterations}${_b64url_encode(salt)}${_b64url_encode(digest)}"

    def verify_password(self, password: str, password_hash: str) -> bool:
        try:
            algorithm, iterations, salt, expected = password_hash.split("$", 3)
        except ValueError:
            return False
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            _b64url_decode(salt),
            int(iterations),
        )
        return hmac.compare_digest(_b64url_encode(digest), expected)


class TokenSigner:
    def __init__(self, secret_key: str) -> None:
        self.secret_key = secret_key.encode("utf-8")

    def sign(self, payload: dict) -> str:
        header = {"alg": "HS256", "typ": "JWT"}
        header_part = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        payload_part = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        signature = hmac.new(
            self.secret_key,
            f"{header_part}.{payload_part}".encode("ascii"),
            hashlib.sha256,
        ).digest()
        return f"{header_part}.{payload_part}.{_b64url_encode(signature)}"

    def verify(self, token: str) -> dict | None:
        try:
            header_part, payload_part, signature_part = token.split(".", 2)
        except ValueError:
            return None
        expected_signature = hmac.new(
            self.secret_key,
            f"{header_part}.{payload_part}".encode("ascii"),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(_b64url_encode(expected_signature), signature_part):
            return None
        payload = json.loads(_b64url_decode(payload_part))
        if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
            return None
        return payload


class AuthService:
    def __init__(
        self,
        store: InMemoryAuthStore | None = None,
        hasher: PasswordHasher | None = None,
        signer: TokenSigner | None = None,
        reset_tokens: dict[str, str] | None = None,
    ) -> None:
        settings = get_settings()
        self.store = store or InMemoryAuthStore()
        self.hasher = hasher or PasswordHasher()
        self.signer = signer or TokenSigner(settings.auth_secret_key)
        self.access_token_minutes = settings.access_token_minutes
        self.reset_tokens = reset_tokens if reset_tokens is not None else self.store.reset_tokens

    def register(self, email: str, password: str, display_name: str | None) -> AuthResult:
        try:
            user = self.store.create_user(
                email=email,
                password_hash=self.hasher.hash_password(password),
                display_name=display_name,
            )
        except ValueError as exc:
            return AuthResult(error=str(exc))
        return AuthResult(user=self._public_user(user), access_token=self._access_token(user))

    def login(self, email: str, password: str) -> AuthResult:
        user = self.store.get_user_by_email(email)
        if user is None or not self.hasher.verify_password(password, user.password_hash):
            return AuthResult(error="invalid_credentials")
        return AuthResult(user=self._public_user(user), access_token=self._access_token(user))

    def request_password_reset(self, email: str) -> str | None:
        user = self.store.get_user_by_email(email)
        if user is None:
            return None
        token = secrets.token_urlsafe(32)
        self.reset_tokens[token] = user.email
        return token

    def confirm_password_reset(self, token: str, new_password: str) -> bool:
        email = self.reset_tokens.pop(token, None)
        if email is None:
            return False
        return self.store.update_password(email, self.hasher.hash_password(new_password))

    def verify_access_token(self, token: str) -> dict | None:
        return self.signer.verify(token)

    def get_user_by_id(self, user_id: str) -> dict | None:
        user = self.store.get_user_by_id(user_id)
        if user is None:
            return None
        return self._public_user(user)

    def _access_token(self, user: StoredUser) -> str:
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=self.access_token_minutes)
        return self.signer.sign({"sub": user.id, "email": user.email, "exp": int(expires_at.timestamp())})

    def _public_user(self, user: StoredUser) -> dict:
        return {
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
        }


auth_service = AuthService()
