/**
 * ProviderSwitchContent - CC-Switch Integration Component
 *
 * Allows users to switch between different Claude API providers
 * configured in cc-switch.
 */

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { RefreshCw, Check, Globe, Zap, AlertCircle } from 'lucide-react';
import ClaudeLogo from '../ClaudeLogo';
import { authenticatedFetch } from '../../utils/api';

export default function ProviderSwitchContent({ onProviderChange }) {
  const [providers, setProviders] = useState([]);
  const [currentProvider, setCurrentProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(null);
  const [error, setError] = useState(null);
  const [ccSwitchInstalled, setCcSwitchInstalled] = useState(false);

  // Fetch providers on mount
  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if cc-switch is installed
      const statusRes = await authenticatedFetch('/api/cc-switch/status');
      const statusData = await statusRes.json();

      if (!statusData.installed) {
        setCcSwitchInstalled(false);
        setLoading(false);
        return;
      }

      setCcSwitchInstalled(true);

      // Fetch providers
      const providersRes = await authenticatedFetch('/api/cc-switch/providers');
      const providersData = await providersRes.json();

      if (providersData.providers) {
        setProviders(providersData.providers);
        const current = providersData.providers.find(p => p.isCurrent);
        setCurrentProvider(current);
      }
    } catch (err) {
      console.error('Failed to fetch providers:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchProvider = async (providerId) => {
    try {
      setSwitching(providerId);
      setError(null);

      const res = await authenticatedFetch(`/api/cc-switch/switch/${providerId}`, {
        method: 'POST'
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to switch provider');
      }

      // Update local state
      setProviders(prev => prev.map(p => ({
        ...p,
        isCurrent: p.id === providerId
      })));
      setCurrentProvider(providers.find(p => p.id === providerId));

      // Notify parent component
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

  if (!ccSwitchInstalled) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <Zap className="w-6 h-6 text-yellow-500" />
          <div>
            <h3 className="text-lg font-medium text-foreground">API Provider Switch</h3>
            <p className="text-sm text-muted-foreground">Powered by CC-Switch</p>
          </div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div>
              <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
                CC-Switch Not Installed
              </h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                To use the provider switching feature, please install CC-Switch first.
              </p>
              <a
                href="https://github.com/farion1231/cc-switch"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-yellow-600 dark:text-yellow-400 hover:underline mt-2 inline-block"
              >
                Learn more about CC-Switch →
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-yellow-500" />
          <div>
            <h3 className="text-lg font-medium text-foreground">API Provider Switch</h3>
            <p className="text-sm text-muted-foreground">
              Switch between different Claude API providers
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStatus}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {currentProvider && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              Current: {currentProvider.name}
            </span>
          </div>
          <p className="text-xs text-green-600 dark:text-green-400 mt-1 ml-6">
            {currentProvider.baseUrl}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className={`border rounded-lg p-4 transition-all ${
              provider.isCurrent
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: provider.iconColor || '#6366f1' }}
                >
                  {provider.icon || provider.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{provider.name}</span>
                    {provider.isCurrent && (
                      <Badge variant="success" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Globe className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {provider.baseUrl}
                    </span>
                  </div>
                  {provider.model && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Model: {provider.model}
                    </div>
                  )}
                </div>
              </div>

              <div>
                {provider.isCurrent ? (
                  <Badge variant="outline" className="text-blue-600 border-blue-300">
                    <Check className="w-3 h-3 mr-1" />
                    Current
                  </Badge>
                ) : (
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

      {providers.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No providers configured in CC-Switch.</p>
          <p className="text-sm mt-1">Open CC-Switch to add API providers.</p>
        </div>
      )}

      <div className="text-xs text-muted-foreground mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p>
          Provider configurations are managed by{' '}
          <a
            href="https://github.com/farion1231/cc-switch"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            CC-Switch
          </a>
          . Changes take effect immediately for new chat sessions.
        </p>
      </div>
    </div>
  );
}
