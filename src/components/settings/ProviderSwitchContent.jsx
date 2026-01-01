/**
 * ProviderSwitchContent - CC-Switch Complete Integration Component
 *
 * Full provider management UI with:
 * - Provider list with CRUD operations
 * - Speed testing
 * - Import/Export
 * - Multi-app support (Claude, Codex, Gemini)
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import {
  RefreshCw, Check, Globe, Zap, AlertCircle, Plus, Trash2, Edit2,
  Play, Download, Upload, Clock, Settings, ChevronRight, Activity, X
} from 'lucide-react';
import { authenticatedFetch } from '../../utils/api';

const APP_TYPES = [
  { id: 'claude', name: 'Claude', color: '#D97706' },
  { id: 'codex', name: 'Codex', color: '#10B981' },
  { id: 'gemini', name: 'Gemini', color: '#4285F4' }
];

export default function ProviderSwitchContent({ onProviderChange }) {
  const [activeApp, setActiveApp] = useState('claude');
  const [providers, setProviders] = useState([]);
  const [currentProvider, setCurrentProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(null);
  const [error, setError] = useState(null);
  const [speedTestResults, setSpeedTestResults] = useState({});
  const [testingAll, setTestingAll] = useState(false);

  // Dialog states
  const [showDialog, setShowDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    category: 'custom',
    baseUrl: '',
    apiKey: '',
    model: '',
    notes: '',
    iconColor: '#6366f1'
  });

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await authenticatedFetch(`/api/cc-switch/providers?app=${activeApp}`);
      const data = await res.json();

      if (data.providers) {
        setProviders(data.providers);
        const current = data.providers.find(p => p.is_current);
        setCurrentProvider(current);
      }
    } catch (err) {
      console.error('Failed to fetch providers:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeApp]);

  const fetchSpeedTestResults = useCallback(async () => {
    try {
      const res = await authenticatedFetch(`/api/cc-switch/speed-test/results?app=${activeApp}`);
      const data = await res.json();

      if (data.results) {
        const resultsMap = {};
        for (const result of data.results) {
          resultsMap[result.provider_id] = result;
        }
        setSpeedTestResults(resultsMap);
      }
    } catch (err) {
      console.error('Failed to fetch speed test results:', err);
    }
  }, [activeApp]);

  useEffect(() => {
    fetchProviders();
    fetchSpeedTestResults();
  }, [fetchProviders, fetchSpeedTestResults]);

  const switchProvider = async (providerId) => {
    try {
      setSwitching(providerId);
      setError(null);

      const res = await authenticatedFetch(`/api/cc-switch/providers/${providerId}/switch?app=${activeApp}`, {
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

  const saveProvider = async () => {
    try {
      const envKey = activeApp === 'claude' ? 'ANTHROPIC' : activeApp === 'codex' ? 'OPENAI' : 'GOOGLE';

      const provider = {
        id: editingProvider?.id,
        name: formData.name,
        app_type: activeApp,
        category: formData.category,
        notes: formData.notes,
        icon_color: formData.iconColor,
        settings_config: {
          env: {
            [`${envKey}_BASE_URL`]: formData.baseUrl,
            [`${envKey}_API_KEY`]: formData.apiKey || undefined,
            [`${envKey}_AUTH_TOKEN`]: formData.apiKey || undefined,
            [`${envKey}_MODEL`]: formData.model || undefined
          }
        }
      };

      // Clean undefined values
      Object.keys(provider.settings_config.env).forEach(key => {
        if (provider.settings_config.env[key] === undefined) {
          delete provider.settings_config.env[key];
        }
      });

      const url = editingProvider
        ? `/api/cc-switch/providers/${editingProvider.id}`
        : '/api/cc-switch/providers';

      const res = await authenticatedFetch(url, {
        method: editingProvider ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(provider)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save provider');
      }

      setShowDialog(false);
      setEditingProvider(null);
      resetForm();
      fetchProviders();
    } catch (err) {
      console.error('Failed to save provider:', err);
      setError(err.message);
    }
  };

  const deleteProvider = async (id) => {
    if (!confirm('Are you sure you want to delete this provider?')) return;

    try {
      const res = await authenticatedFetch(`/api/cc-switch/providers/${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete provider');
      }

      fetchProviders();
    } catch (err) {
      console.error('Failed to delete provider:', err);
      setError(err.message);
    }
  };

  const testProvider = async (providerId) => {
    try {
      setSpeedTestResults(prev => ({
        ...prev,
        [providerId]: { ...prev[providerId], testing: true }
      }));

      const res = await authenticatedFetch('/api/cc-switch/speed-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, app: activeApp })
      });

      const data = await res.json();

      if (data.success) {
        setSpeedTestResults(prev => ({
          ...prev,
          [providerId]: {
            ...data.result,
            testing: false
          }
        }));
      }
    } catch (err) {
      console.error('Failed to test provider:', err);
      setSpeedTestResults(prev => ({
        ...prev,
        [providerId]: { ...prev[providerId], testing: false, status: 'failed' }
      }));
    }
  };

  const testAllProviders = async () => {
    try {
      setTestingAll(true);

      const res = await authenticatedFetch('/api/cc-switch/speed-test/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: activeApp })
      });

      const data = await res.json();

      if (data.success) {
        const resultsMap = {};
        for (const result of data.results) {
          resultsMap[result.providerId] = result;
        }
        setSpeedTestResults(prev => ({ ...prev, ...resultsMap }));
      }
    } catch (err) {
      console.error('Failed to test all providers:', err);
    } finally {
      setTestingAll(false);
    }
  };

  const exportConfig = async () => {
    try {
      const res = await authenticatedFetch('/api/cc-switch/export');
      const data = await res.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cc-switch-config-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export config:', err);
      setError(err.message);
    }
  };

  const importConfig = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const data = JSON.parse(content);

      const res = await authenticatedFetch('/api/cc-switch/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await res.json();

      if (result.success) {
        alert(`Imported: ${result.imported.providers} providers, ${result.imported.prompts} prompts, ${result.imported.mcpServers} MCP servers`);
        fetchProviders();
      }
    } catch (err) {
      console.error('Failed to import config:', err);
      setError(err.message);
    }

    event.target.value = '';
  };

  const importDefaults = async () => {
    try {
      const res = await authenticatedFetch('/api/cc-switch/providers/import-defaults', {
        method: 'POST'
      });

      const data = await res.json();

      if (data.success) {
        fetchProviders();
      }
    } catch (err) {
      console.error('Failed to import defaults:', err);
      setError(err.message);
    }
  };

  const openEditDialog = (provider) => {
    const config = provider.settings_config || {};
    const env = config.env || {};
    const envKey = activeApp === 'claude' ? 'ANTHROPIC' : activeApp === 'codex' ? 'OPENAI' : 'GOOGLE';

    setFormData({
      name: provider.name,
      category: provider.category || 'custom',
      baseUrl: env[`${envKey}_BASE_URL`] || '',
      apiKey: '',
      model: env[`${envKey}_MODEL`] || '',
      notes: provider.notes || '',
      iconColor: provider.icon_color || '#6366f1'
    });
    setEditingProvider(provider);
    setShowDialog(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'custom',
      baseUrl: '',
      apiKey: '',
      model: '',
      notes: '',
      iconColor: '#6366f1'
    });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'operational': return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Healthy</Badge>;
      case 'degraded': return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">Slow</Badge>;
      case 'failed': return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Failed</Badge>;
      default: return null;
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
            <p className="text-sm text-muted-foreground">Manage API providers for AI tools</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchProviders} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* App Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {APP_TYPES.map(app => (
          <button
            key={app.id}
            onClick={() => setActiveApp(app.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeApp === app.id
                ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: app.color }} />
            {app.name}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
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

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Add Provider
        </Button>
        <Button variant="outline" size="sm" onClick={testAllProviders} disabled={testingAll}>
          <Activity className={`w-4 h-4 mr-2 ${testingAll ? 'animate-pulse' : ''}`} />
          Test All
        </Button>
        <Button variant="outline" size="sm" onClick={importDefaults}>
          <Download className="w-4 h-4 mr-2" />
          Import Defaults
        </Button>
        <Button variant="outline" size="sm" onClick={exportConfig}>
          <Upload className="w-4 h-4 mr-2" />
          Export
        </Button>
        <label>
          <input type="file" accept=".json" onChange={importConfig} className="hidden" />
          <Button variant="outline" size="sm" asChild>
            <span>
              <Download className="w-4 h-4 mr-2" />
              Import
            </span>
          </Button>
        </label>
      </div>

      {/* Provider List */}
      <div className="space-y-2">
        {providers.map((provider) => {
          const testResult = speedTestResults[provider.id];

          return (
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
                      {testResult && getStatusBadge(testResult.status)}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Globe className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {provider.baseUrl || 'Default endpoint'}
                      </span>
                      {testResult?.responseTime && (
                        <span className="text-xs text-muted-foreground">
                          ({testResult.responseTime}ms)
                        </span>
                      )}
                    </div>
                    {provider.model && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Model: {provider.model}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => testProvider(provider.id)}
                    disabled={testResult?.testing}
                  >
                    <Play className={`w-4 h-4 ${testResult?.testing ? 'animate-pulse' : ''}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(provider)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteProvider(provider.id)}
                    disabled={provider.is_current}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
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
          );
        })}
      </div>

      {providers.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No providers configured.</p>
          <p className="text-sm mt-1">Click "Add Provider" or "Import Defaults" to get started.</p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
          <div className="bg-background border border-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">
                {editingProvider ? 'Edit Provider' : 'Add Provider'}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => { setShowDialog(false); setEditingProvider(null); resetForm(); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Custom Provider"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                >
                  <option value="official">Official</option>
                  <option value="partner">Partner</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Base URL</label>
                <Input
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  placeholder="https://api.example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">API Key</label>
                <Input
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder={editingProvider ? '(unchanged)' : 'sk-...'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Model (optional)</label>
                <Input
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="claude-sonnet-4-20250514"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Notes (optional)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={2}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Icon Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.iconColor}
                    onChange={(e) => setFormData({ ...formData, iconColor: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <Input
                    value={formData.iconColor}
                    onChange={(e) => setFormData({ ...formData, iconColor: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-border">
              <Button variant="outline" onClick={() => { setShowDialog(false); setEditingProvider(null); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={saveProvider} disabled={!formData.name}>
                {editingProvider ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-xs text-muted-foreground mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p>
          Manage API providers for Claude, Codex, and Gemini. Changes take effect immediately for new chat sessions.
        </p>
      </div>
    </div>
  );
}
