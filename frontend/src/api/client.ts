import axios from "axios";

// Base URL of the FastAPI backend. Override with VITE_API_URL if needed.
const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const apiClient = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});
