"""Outbound URL validation to prevent SSRF via user-supplied base_url overrides.

Any URL a user sets here (``LLMCredential.base_url``) ends up as the
``base_url`` of a real outbound ``httpx.Client`` (see
``app.llm.openai_compatible_provider``). Without this check, a user could point
it at a cloud metadata endpoint (``169.254.169.254``), loopback, or another
internal-network address and use "test connection" / plan generation as an
internal port scanner or credential-exfiltration oracle.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

from app.core.exceptions import ValidationError

_ALLOWED_SCHEMES = {"http", "https"}


def assert_safe_outbound_url(url: str) -> None:
    """Raise ``ValidationError`` unless ``url`` is a plausibly-public http(s) host.

    Blocks private/loopback/link-local/reserved/unspecified/multicast address
    ranges (this covers RFC1918, ``127.0.0.0/8``, ``169.254.0.0/16`` — including
    the AWS/GCP/Azure metadata IP — ``::1``, ``0.0.0.0``, etc.) and rejects
    embedded userinfo (``user:pass@host``) and any non-http(s) scheme.
    """
    parsed = urlsplit(url)

    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise ValidationError("La URL base debe comenzar con http:// o https://.")
    if parsed.username or parsed.password:
        raise ValidationError("La URL base no puede incluir credenciales embebidas.")

    hostname = parsed.hostname
    if not hostname:
        raise ValidationError("La URL base no es válida.")

    try:
        resolved = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise ValidationError(f"No se pudo resolver el host de la URL base: {hostname}") from exc

    for _family, _type, _proto, _canonname, sockaddr in resolved:
        ip = ipaddress.ip_address(sockaddr[0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise ValidationError(
                "La URL base resuelve a una dirección de red privada o interna, "
                "lo cual no está permitido."
            )
