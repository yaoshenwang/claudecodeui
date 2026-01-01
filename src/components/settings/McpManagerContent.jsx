/**
 * McpManagerContent - MCP Server Management Component
 *
 * Unified MCP server management across Claude, Codex, and Gemini
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import {
  RefreshCw, Plus, Trash2, Edit2, Server, Play, X
} from 'lucide-react';
import { authenticatedFetch } from '../../utils/api';

export default function McpManagerContent() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Dialog states
  const [showDialog, setShowDialog] = useState(false);
  const [editingServer, setEditingServer] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    command: '',
    args: '',
    env: '',
    description: '',
    enabled_claude: true,
    enabled_codex: false,
    enabled_gemini: false
  });

  const fetchServers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await authenticatedFetch('/api/cc-switch/mcp');
      const data = await res.json();

      if (data.servers) {
        setServers(data.servers);
      }
    } catch (err) {
      console.error('Failed to fetch MCP servers:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const saveServer = async () => {
    try {
      let args = [];
      let env = {};

      try {
        args = formData.args ? JSON.parse(formData.args) : [];
      } catch {
        args = formData.args.split('\n').filter(Boolean);
      }

      try {
        env = formData.env ? JSON.parse(formData.env) : {};
      } catch {
        const lines = formData.env.split('\n').filter(Boolean);
        for (const line of lines) {
          const [key, ...valueParts] = line.split('=');
          if (key) {
            env[key.trim()] = valueParts.join('=').trim();
          }
        }
      }

      const server = {
        id: editingServer?.id,
        name: formData.name,
        command: formData.command,
        args,
        env,
        description: formData.description,
        enabled_claude: formData.enabled_claude,
        enabled_codex: formData.enabled_codex,
        enabled_gemini: formData.enabled_gemini
      };

      const url = editingServer
        ? `/api/cc-switch/mcp/${editingServer.id}`
        : '/api/cc-switch/mcp';

      const res = await authenticatedFetch(url, {
        method: editingServer ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(server)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save server');
      }

      setShowDialog(false);
      setEditingServer(null);
      resetForm();
      fetchServers();
    } catch (err) {
      console.error('Failed to save server:', err);
      setError(err.message);
    }
  };

  const deleteServer = async (id) => {
    if (!confirm('Are you sure you want to delete this MCP server?')) return;

    try {
      const res = await authenticatedFetch(`/api/cc-switch/mcp/${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete server');
      }

      fetchServers();
    } catch (err) {
      console.error('Failed to delete server:', err);
      setError(err.message);
    }
  };

  const toggleServer = async (id, app, enabled) => {
    try {
      await authenticatedFetch(`/api/cc-switch/mcp/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app, enabled })
      });

      setServers(prev => prev.map(s => {
        if (s.id === id) {
          return { ...s, [`enabled_${app}`]: enabled };
        }
        return s;
      }));
    } catch (err) {
      console.error('Failed to toggle server:', err);
      setError(err.message);
    }
  };

  const syncToApps = async () => {
    try {
      setSyncing(true);

      for (const app of ['claude', 'codex', 'gemini']) {
        await authenticatedFetch('/api/cc-switch/mcp/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app })
        });
      }

      alert('MCP configuration synced to all apps!');
    } catch (err) {
      console.error('Failed to sync:', err);
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const openEditDialog = (server) => {
    setFormData({
      name: server.name,
      command: server.command,
      args: JSON.stringify(server.args, null, 2),
      env: JSON.stringify(server.env, null, 2),
      description: server.description || '',
      enabled_claude: server.enabled_claude,
      enabled_codex: server.enabled_codex,
      enabled_gemini: server.enabled_gemini
    });
    setEditingServer(server);
    setShowDialog(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      command: '',
      args: '',
      env: '',
      description: '',
      enabled_claude: true,
      enabled_codex: false,
      enabled_gemini: false
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading MCP servers...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Server className="w-6 h-6 text-purple-500" />
          <div>
            <h3 className="text-lg font-medium text-foreground">MCP Server Manager</h3>
            <p className="text-sm text-muted-foreground">Manage MCP servers across all apps</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={syncToApps} disabled={syncing}>
            <Play className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sync All
          </Button>
          <Button variant="outline" size="sm" onClick={fetchServers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Add Button */}
      <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }}>
        <Plus className="w-4 h-4 mr-2" />
        Add MCP Server
      </Button>

      {/* Server List */}
      <div className="space-y-2">
        {servers.map((server) => (
          <div
            key={server.id}
            className="border rounded-lg p-4 border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Server className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{server.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {server.command} {server.args?.join(' ')}
                  </div>
                  {server.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {server.description}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* App toggles */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={server.enabled_claude}
                      onChange={(e) => toggleServer(server.id, 'claude', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="text-xs text-muted-foreground">Claude</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={server.enabled_codex}
                      onChange={(e) => toggleServer(server.id, 'codex', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="text-xs text-muted-foreground">Codex</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={server.enabled_gemini}
                      onChange={(e) => toggleServer(server.id, 'gemini', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="text-xs text-muted-foreground">Gemini</span>
                  </label>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(server)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteServer(server.id)}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {servers.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No MCP servers configured.</p>
          <p className="text-sm mt-1">Click "Add MCP Server" to get started.</p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
          <div className="bg-background border border-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">
                {editingServer ? 'Edit MCP Server' : 'Add MCP Server'}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => { setShowDialog(false); setEditingServer(null); resetForm(); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="my-mcp-server"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Command</label>
                <Input
                  value={formData.command}
                  onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                  placeholder="npx, node, python, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Arguments (JSON array or one per line)</label>
                <textarea
                  value={formData.args}
                  onChange={(e) => setFormData({ ...formData, args: e.target.value })}
                  placeholder='["-y", "@anthropic-ai/mcp-server"]'
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Environment Variables (JSON or KEY=VALUE)</label>
                <textarea
                  value={formData.env}
                  onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                  placeholder='{"API_KEY": "xxx"}'
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description (optional)</label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What this server does..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Enable for Apps</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enabled_claude}
                      onChange={(e) => setFormData({ ...formData, enabled_claude: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="text-sm">Claude</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enabled_codex}
                      onChange={(e) => setFormData({ ...formData, enabled_codex: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="text-sm">Codex</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enabled_gemini}
                      onChange={(e) => setFormData({ ...formData, enabled_gemini: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="text-sm">Gemini</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-border">
              <Button variant="outline" onClick={() => { setShowDialog(false); setEditingServer(null); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={saveServer} disabled={!formData.name || !formData.command}>
                {editingServer ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
