# Proveedores LLM y credenciales

> **Leer antes de** añadir/modificar un proveedor, un perfil de petición, el flujo de credenciales
> (`/llm-settings/*`) o cualquier cosa que construya un cliente HTTP saliente.

## Registro de proveedores

Each provider owns its metadata, configuration validation, request profile, runtime construction and
verification contract under `app/llm/providers/`; `app/llm/provider_registry.py` is the sole assembly
point. `PROVIDER_CATALOG` (`app/llm/providers_catalog.py`) is a compatibility view derived from that
registry and is served to the frontend via `GET /llm-settings/catalog`. Keep transport/retry/error
primitives shared, but **do not add vendor branches to the factory, settings service, profile resolver,
or verification fingerprint**. Adding a provider requires its own definition, registry entry,
`LLMProviderName` member/database migration, and contract tests.

- `OpenAICompatibleProvider` (`app/llm/openai_compatible_provider.py`, raw `httpx`, no `openai` SDK)
  serves OpenAI and DeepSeek (`https://api.deepseek.com`). OpenRouter uses its direct adapter, NVIDIA NIM
  uses `NvidiaNimProvider` and Anthropic its native SDK adapter. Agentes CLI: [agentes-cli.md](agentes-cli.md).
- Unlike the `.env` path (which splits Opus-for-plan / Haiku-for-quiz via `AnthropicProvider._model_for`),
  a user-configured credential always uses **one fixed model for every call kind** — deliberate product
  decision, not an oversight.
- `PROVIDER_CATALOG.common_models` is `ModelOption(id, free)` tuples ordered free-tier first, then
  cheapest-to-priciest — preserve that order (`common_models[0].free`).
- `ProviderMeta.key_placeholder` (default `"sk-..."`, e.g. `"nvapi-..."`, `"AIza..."`) is UI-only.
- Zhipu GLM and Hugging Face were removed; ver [../arquitectura/base-de-datos.md](../arquitectura/base-de-datos.md).

## NVIDIA NIM no es genérico

Its public catalog includes non-generative APIs, and hosted asynchronous responses can return `202` after
accepting billable work. The source-controlled `app/llm/nvidia_models.py` registry is the authorization
boundary for NVIDIA models and stores the payload contract, output limit and verification version per
model. `NvidiaNimProvider` fixes the endpoint to `https://integrate.api.nvidia.com/v1`, sends
`stream: false`, disallows custom model IDs and URLs, and polls the documented NVCF status endpoint without
ever reissuing the POST. If NVCF returns metadata instead of a completion, it raises
`LLM_ASYNC_RESULT_UNAVAILABLE`; never guess a retrieval endpoint or retry the original request.

## Razonamiento apagado o mínimo

Reasoning models spend hidden tokens that eat each call's sized `max_tokens` budget (the cause of old
`LLM_OUTPUT_LIMIT` failures) and slow every request. Fixed vendor fields go through
`RequestProfile.extra_parameters` (or NVIDIA's `static_parameters`), never a branch in the transport:

| Provider | Where | Field |
|---|---|---|
| Ollama | `providers/ollama.py` | `"reasoning_effort": "none"` |
| NVIDIA NIM | `nvidia_models.py` | `"reasoning_effort": "none"` |
| Gemini 3.x Flash / Pro | `providers/gemini.py` (`gemini-3*` profiles) | `thinkingConfig.thinkingLevel` `"minimal"` / `"low"` |
| DeepSeek | `providers/deepseek.py` | `"thinking": {"type": "disabled"}` |
| Gemma, Gemini 2.x, OpenRouter, OpenAI, Anthropic | — | unchanged |

Changing a profile's identity (`identifier`/`version`, NVIDIA `contract_version`) invalidates every
verified credential using it, so do it **only** when the new field can break an already verified
configuration. A field documented as accepted or ignored by every model of the profile goes into
`extra_parameters` without a version bump.

## Flujo de credenciales revisionado (impuesto en backend)

`PUT /llm-settings/{p}` stores or replaces only the key. `PATCH /llm-settings/{p}/model` persists a
model/URL draft with its `expected_revision`, invalidating prior evidence. `POST .../test` tests exactly
that saved revision; it never substitutes a catalog default model. `POST .../activate` accepts only
evidence matching the same revision and effective URL fingerprint. `LLMCredential.model` is a draft, not a
verification marker; use the derived `is_verified` response field. Replacing a key resets the model and
evidence, while changing a model or URL creates a new revision and deactivates it.

**Model changes never inherit verification evidence.** `update_model` stays a no-network draft write so
users can recover from unavailable models, but it invalidates the prior revision atomically. The UI then
tests the saved draft and only enables activation after the server returns matching evidence. Catalog
entries remain suggestions for generic providers; NVIDIA's curated registry is enforced.

## `base_url` es superficie SSRF

`ProviderMeta.supports_custom_base_url` is false for Anthropic, DeepSeek, NVIDIA and Ollama; never accept
an override for them. Anthropic historical overrides must fail with `LLM_UNSUPPORTED_CONFIGURATION` before
the SDK is constructed, so the user can explicitly clear the stored value. For supported OpenAI-compatible
providers it is a free-text override that ends up as the `base_url` of a real outbound `httpx.Client`.
`app/core/url_safety.py::assert_safe_outbound_url` resolves the hostname and rejects
private/loopback/link-local/reserved ranges (covers `169.254.169.254`) — called both at save time
(`LLMSettingsService.upsert_credential`) and again right before use
(`factory.build_provider_from_credential`), since DNS can resolve differently between the two. Never
reintroduce a bare `startswith("http")` check.

## Seguridad de claves

`app/core/security.py` encrypts `LLMCredential.encrypted_api_key` at rest with Fernet keyed from
`SECRET_KEY` (SHA-256 → urlsafe-base64) — change `SECRET_KEY` from the placeholder before deploying.
Decryption failure (e.g. `SECRET_KEY` rotated) raises `SecretDecryptionError`, which `get_llm_provider`
treats as "this tier doesn't work," not a crash. `LLMCredentialResponse` (`app/schemas/llm_settings.py`)
is built field-by-field, **never `from_attributes=True` on the raw ORM row**. Only `key_preview` (computed
once at write time via `mask_secret()`) ever leaves the server. Provider code only logs status
codes/truncated error bodies, never request payloads or the `Authorization` header.
