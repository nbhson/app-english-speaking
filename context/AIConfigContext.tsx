/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext } from 'react';
import type { AIConfig } from '../utils/api';

const AIConfigContext = createContext<AIConfig | null>(null);

export const AIConfigProvider: React.FC<{ config: AIConfig; children: React.ReactNode }> = ({
  config,
  children,
}) => {
  return <AIConfigContext.Provider value={config}>{children}</AIConfigContext.Provider>;
};

export function useAIConfig(): AIConfig {
  const ctx = useContext(AIConfigContext);
  if (!ctx) throw new Error('useAIConfig must be used within AIConfigProvider');
  return ctx;
}


