"""Throwaway-mail guard for the welcome credits."""

from __future__ import annotations

# shortcut: lista estática corta, cambiar a un servicio o lista mantenida si hay abuso
DISPOSABLE_EMAIL_DOMAINS = frozenset(
    {
        "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "sharklasers.com",
        "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org", "temp-mail.io",
        "throwawaymail.com", "yopmail.com", "yopmail.net", "trashmail.com", "getnada.com", "maildrop.cc",
        "dispostable.com", "fakeinbox.com", "mintemail.com", "mohmal.com", "emailondeck.com",
        "tempail.com", "burnermail.io", "mailnesia.com", "spamgourmet.com", "moakt.com",
    }
)


def is_disposable_email(email: str) -> bool:
    return email.rsplit("@", 1)[-1].strip().lower() in DISPOSABLE_EMAIL_DOMAINS


def normalize_email(email: str) -> str:
    """One key per inbox: lowercase, no ``+tag`` and, for Gmail, no dots (a+b@x and a@x are the same inbox)."""
    local, _, domain = email.strip().lower().rpartition("@")
    local = local.split("+", 1)[0]
    if domain in ("gmail.com", "googlemail.com"):
        local, domain = local.replace(".", ""), "gmail.com"
    return f"{local}@{domain}"
