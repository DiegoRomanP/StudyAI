"""Aggregate v1 API router."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.routes import account, adaptive_assessment, adaptive_learning, assistant, billing, complaints, dashboard, documents, goals, llm_settings, plans, quizzes, sessions, system

api_router = APIRouter()
api_router.include_router(account.router)
api_router.include_router(billing.router)
api_router.include_router(complaints.router)
api_router.include_router(documents.router)
api_router.include_router(goals.router)
api_router.include_router(plans.router)
api_router.include_router(sessions.router)
api_router.include_router(adaptive_learning.router)
api_router.include_router(quizzes.router)
api_router.include_router(adaptive_assessment.router)
api_router.include_router(dashboard.router)
api_router.include_router(llm_settings.router)
api_router.include_router(assistant.router)
api_router.include_router(system.router)
