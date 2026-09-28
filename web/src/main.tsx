import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/overlays";
import { router } from "./router";
import { useTheme } from "./stores/theme";

function App() {
  const theme = useTheme((s) => s.theme);
  return (
    <TooltipProvider delayDuration={300}>
      <RouterProvider router={router} />
      <Toaster
        theme={theme}
        position="bottom-right"
        toastOptions={{
          className: "!rounded-lg !border-border !bg-popover !text-popover-foreground !text-[13px]",
        }}
      />
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
