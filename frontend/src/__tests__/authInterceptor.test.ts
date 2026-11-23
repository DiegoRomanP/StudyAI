import type { AxiosAdapter, AxiosResponse } from "axios";
import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabase: { auth } }));

import { apiClient } from "../api/client";

const respond = (status: number, data: unknown = {}): AxiosAdapter => async (config) => {
  const response = { data, status, statusText: "", headers: {}, config } as AxiosResponse;
  if (status >= 400) throw new AxiosError("fail", String(status), config, null, response);
  return response;
};

const assign = vi.fn();
beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal("location", { assign, pathname: "/plan/3", search: "?x=1" });
});
afterEach(() => vi.unstubAllGlobals());

describe("apiClient auth interceptors", () => {
  it("asks getSession on every request and sends that request's own token", async () => {
    const seen: unknown[] = [];
    apiClient.defaults.adapter = async (config) => {
      seen.push(config.headers.get("Authorization"));
      return respond(200)(config);
    };
    auth.getSession
      .mockResolvedValueOnce({ data: { session: { access_token: "uno" } } })
      .mockResolvedValueOnce({ data: { session: { access_token: "dos" } } })
      .mockResolvedValueOnce({ data: { session: null } });

    await apiClient.get("/a");
    await apiClient.get("/b");
    await apiClient.get("/c");

    expect(seen).toEqual(["Bearer uno", "Bearer dos", undefined]);
    expect(auth.getSession).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["flat", { code: "AUTH_INVALID_TOKEN" }],
    ["nested", { detail: { code: "AUTH_REQUIRED" } }],
  ])("redirects to /login on a 401 with an auth code (%s)", async (_name, body) => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    apiClient.defaults.adapter = respond(401, body);

    await expect(apiClient.get("/x")).rejects.toBeDefined();

    expect(assign).toHaveBeenCalledWith("/login?next=%2Fplan%2F3%3Fx%3D1");
  });

  it("does not redirect on other errors", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    apiClient.defaults.adapter = respond(401, { detail: "otro" });

    await expect(apiClient.get("/x")).rejects.toBeDefined();

    expect(assign).not.toHaveBeenCalled();
  });
});
