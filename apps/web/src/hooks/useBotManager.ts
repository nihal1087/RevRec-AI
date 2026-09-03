import { useState, useCallback } from "react";

export function useBotManager() {
  const [isBotOpen, setIsBotOpen] = useState(false);
  const [botWorkflowId, setBotWorkflowId] = useState<string | undefined>(undefined);
  const [botCustomerId, setBotCustomerId] = useState<string | undefined>(undefined);

  const openBot = useCallback((workflowId?: string, customerId?: string) => {
    setBotWorkflowId(workflowId);
    setBotCustomerId(customerId);
    setIsBotOpen(true);
  }, []);

  const closeBot = useCallback(() => {
    setIsBotOpen(false);
    setBotWorkflowId(undefined);
    setBotCustomerId(undefined);
  }, []);

  return { isBotOpen, botWorkflowId, botCustomerId, openBot, closeBot };
}
