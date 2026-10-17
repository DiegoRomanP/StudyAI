import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Honour prefers-reduced-motion for every Motion animation. */}
      <MotionConfig reducedMotion="user">
        {/* Only the DOM animation features; components use the lightweight `m`. */}
        <LazyMotion features={domAnimation} strict>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </LazyMotion>
      </MotionConfig>
    </QueryClientProvider>
  </React.StrictMode>,
);
