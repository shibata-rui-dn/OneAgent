import { useAuth } from './oauth-components';

export function useAgent() {
  const { authenticatedFetch, isAuthenticated } = useAuth();

  const queryAgent = async (query, tools = [], options = {}) => {
    if (!isAuthenticated) {
      throw new Error('認証が必要です');
    }

    const response = await authenticatedFetch('/agent', {
      method: 'POST',
      body: JSON.stringify({
        query,
        tools,
        streaming: false,
        ...options
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  };

  return { queryAgent, isAuthenticated };
}