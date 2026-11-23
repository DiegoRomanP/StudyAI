"""Supabase access-token verification (asymmetric keys only).

Keys come from the project's JWKS endpoint (ES256/RS256) so there is no shared secret to leak and
rotation is automatic. HS256 is never accepted. ``jwt`` (PyJWT) is imported lazily: self-hosted
installs without the SaaS extras never load it.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.exceptions import AuthenticationError

ALGORITHMS = ["ES256", "RS256"]


@dataclass(frozen=True)
class AuthClaims:
    sub: str
    email: str


class SupabaseTokenVerifier:
    def __init__(self, *, jwks_url: str, issuer: str, audience: str, jwk_client: object | None = None) -> None:
        self._jwks_url = jwks_url
        self._issuer = issuer
        self._audience = audience
        self._jwk_client = jwk_client

    def _client(self) -> object:
        if self._jwk_client is None:
            from jwt import PyJWKClient

            self._jwk_client = PyJWKClient(self._jwks_url, cache_keys=True, lifespan=600)
        return self._jwk_client

    def verify(self, token: str) -> AuthClaims:
        import jwt

        try:
            key = self._client().get_signing_key_from_jwt(token).key
            payload = jwt.decode(
                token,
                key,
                algorithms=ALGORITHMS,
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "iss", "aud", "sub"]},
            )
        except jwt.PyJWTError:
            raise AuthenticationError("Token inválido o caducado.", "AUTH_INVALID_TOKEN") from None
        email = payload.get("email")
        # Anonymous sessions have no verified email; D2: a non-anonymous token implies a confirmed one.
        if payload.get("is_anonymous") or not isinstance(email, str) or not email:
            raise AuthenticationError("Token inválido o caducado.", "AUTH_INVALID_TOKEN")
        return AuthClaims(sub=str(payload["sub"]), email=email.strip().lower())
