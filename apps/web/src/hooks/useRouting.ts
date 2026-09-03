import { useState, useEffect } from "react";

export type AppPage = "dashboard" | "communications" | "funnel" | "demo" | "bot" | "case";

const PAGE_FROM_HASH: Record<string, AppPage> = {
  "#/": "dashboard",
  "#/communications": "communications",
  "#/funnel": "funnel",
  "#/demo": "demo",
  "#/bot": "bot",
};

function pageFromHash(): AppPage {
  const hash = window.location.hash;
  if (hash.startsWith("#/case/")) return "case";
  return PAGE_FROM_HASH[hash] ?? (localStorage.getItem("revrec_page") as AppPage | null) ?? "dashboard";
}

export function useRouting() {
  const [currentPage, setCurrentPage] = useState<AppPage>(pageFromHash);
  const [caseWorkflowId, setCaseWorkflowId] = useState<string | null>(() => {
    const hash = window.location.hash;
    return hash.startsWith("#/case/") ? hash.replace("#/case/", "") : null;
  });

  useEffect(() => {
    const handler = () => {
      const page = pageFromHash();
      setCurrentPage(page);
      if (page === "case") {
        setCaseWorkflowId(window.location.hash.replace("#/case/", ""));
      }
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = (page: AppPage, workflowId?: string) => {
    localStorage.setItem("revrec_page", page);
    if (page === "case" && workflowId) {
      window.location.hash = `#/case/${workflowId}`;
      setCaseWorkflowId(workflowId);
    } else {
      const hashMap: Record<AppPage, string> = {
        dashboard: "#/",
        communications: "#/communications",
        funnel: "#/funnel",
        demo: "#/demo",
        bot: "#/bot",
        case: "#/",
      };
      window.location.hash = hashMap[page];
    }
    setCurrentPage(page);
  };

  return { currentPage, caseWorkflowId, navigate };
}
