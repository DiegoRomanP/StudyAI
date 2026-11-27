import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { api } from "../api/endpoints";
import type { ComplaintCreate, OrderDTO } from "../api/types";
import { CREDITS_QUERY_KEY } from "./useCredits";

export const ORDERS_QUERY_KEY = ["billing-orders"] as const;
export const ORDER_POLL_MS = 3000;
export const ORDER_POLL_MAX_MS = 5 * 60 * 1000;

const PRICE_FORMAT = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

/** `490` → `S/ 4.90` (Intl decides the separators for es-PE). */
export function formatPrice(cents: number) {
  return PRICE_FORMAT.format(cents / 100);
}

export function useProducts() {
  return useQuery({ queryKey: ["billing-products"], queryFn: api.listProducts, staleTime: 5 * 60 * 1000 });
}

export function useOrders(enabled = true) {
  return useQuery({ queryKey: ORDERS_QUERY_KEY, queryFn: api.listOrders, enabled });
}

export function useCheckout() {
  return useMutation({
    mutationFn: async ({ productCode, idempotencyKey }: { productCode: string; idempotencyKey: string }) => {
      const checkout = await api.createCheckout(productCode, idempotencyKey);
      if (!isSafeCheckoutUrl(checkout.checkout_url)) throw new Error("Unsafe checkout URL");
      return checkout;
    },
  });
}

/** The page we navigate to must be https (the gateway) or this app (the fake gateway): never `javascript:`. */
export function isSafeCheckoutUrl(url: string) {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === "https:" || parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * One order, polled every 3 s while `pending` and `polling` is true (the page stops it after 5 min).
 * When it becomes `paid` the credit balance and the purchase history are refreshed.
 */
export function useOrder(id: number | null, polling: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...ORDERS_QUERY_KEY, id],
    queryFn: () => api.getOrder(id as number),
    enabled: id !== null,
    refetchInterval: (q) => (polling && q.state.data?.status === "pending" ? ORDER_POLL_MS : false),
  });
  const paid = query.data?.status === "paid";
  useEffect(() => {
    if (!paid) return;
    void queryClient.invalidateQueries({ queryKey: CREDITS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY, exact: true });
  }, [paid, queryClient]);
  return query;
}

/** Development with the fake gateway only: marks the order paid. */
export function useFakeCompleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.fakeCompleteOrder,
    onSuccess: (order: OrderDTO) => queryClient.setQueryData([...ORDERS_QUERY_KEY, order.id], order),
  });
}

export function useSubmitComplaint() {
  return useMutation({ mutationFn: (payload: ComplaintCreate) => api.submitComplaint(payload) });
}
