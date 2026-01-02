/**
 * ProviderSwitchContent - CC-Switch Provider Switcher (Read-Only)
 *
 * Simple provider switching UI:
 * - Display providers from CC-Switch
 * - Switch between providers
 * - Show current active provider
 *
 * All provider management (add/edit/delete) is done in CC-Switch app
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { RefreshCw, Check, Globe, Zap, AlertCircle } from 'lucide-react';
import { authenticatedFetch } from '../../utils/api';

export default function ProviderSwitchContent({ onProviderChange }) {
  const [providers, setProviders] = useState([]);
  const [currentProvider, setCurrentProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(null);
  const [error, setError] = useState(null);

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await authenticatedFetch('/api/cc-switch/providers?app=claude');
      const data = await res.json();

      if (data.providers) {
        setProviders(data.providers);
        const current = data.providers.find(p => p.is_current);
        setCurrentProvider(current);
      }

      if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      console.error('Failed to fetch providers:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const switchProvider = async (providerId) => {
    try {
      setSwitching(providerId);
      setError(null);

      const res = await authenticatedFetch(`/api/cc-switch/providers/${providerId}/switch?app=claude`, {
        method: 'POST'
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to switch provider');
      }

      setProviders(prev => prev.map(p => ({
        ...p,
        is_current: p.id === providerId
      })));
      setCurrentProvider(providers.find(p => p.id === providerId));

      if (onProviderChange) {
        onProviderChange(data.provider);
      }
    } catch (err) {
      console.error('Failed to switch provider:', err);
      setError(err.message);
    } finally {
      setSwitching(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading providers...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-yellow-500" />
          <div>
            <h3 className="text-lg font-medium text-foreground">API Provider Switch</h3>
            <p className="text-sm text-muted-foreground">Switch between API providers from CC-Switch</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchProviders} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <p className="text-sm text-yellow-600 dark:text-yellow-400">{error}</p>
          </div>
          <p className="text-xs text-yellow-500 dark:text-yellow-500 mt-1 ml-6">
            Please install and configure providers in CC-Switch app
          </p>
        </div>
      )}

      {/* Current Provider Banner */}
      {currentProvider && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              Current: {currentProvider.name}
            </span>
          </div>
          <p className="text-xs text-green-600 dark:text-green-400 mt-1 ml-6">
            {currentProvider.baseUrl || 'Default endpoint'}
          </p>
        </div>
      )}

      {/* Provider List */}
      <div className="space-y-2">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className={`border rounded-lg p-4 transition-all ${
              provider.is_current
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: provider.icon_color || '#6366f1' }}
                >
                  {provider.icon || provider.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{provider.name}</span>
                    {provider.is_current && (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        Active
                      </Badge>
                    )}
                    {provider.category === 'official' && (
                      <Badge variant="outline" className="text-blue-600 border-blue-300">
                        Official
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Globe className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {provider.baseUrl || 'Default endpoint'}
                    </span>
                  </div>
                  {provider.model && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Model: {provider.model}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!provider.is_current && (
                  <Button
                    size="sm"
                    onClick={() => switchProvider(provider.id)}
                    disabled={switching !== null}
                  >
                    {switching === provider.id ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Switching...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Switch
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {provider.notes && (
              <p className="text-sm text-muted-foreground mt-2 ml-13">
                {provider.notes}
              </p>
            )}
          </div>
        ))}
      </div>

      {providers.length === 0 && !error && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No providers configured in CC-Switch.</p>
          <p className="text-sm mt-1">Please add providers in the CC-Switch app.</p>
        </div>
      )}

      {/* Footer */}
      <div className="text-xs text-muted-foreground mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p>
          Providers are managed in the CC-Switch app. Changes take effect immediately for new chat sessions.
        </p>
      </div>
    </div>
  );
}
