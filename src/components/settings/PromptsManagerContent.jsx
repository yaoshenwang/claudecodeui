/**
 * PromptsManagerContent - System Prompt Management Component
 *
 * Manage system prompts across Claude, Codex, and Gemini
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import {
  RefreshCw, Plus, Trash2, Edit2, FileText, Check, Power, X
} from 'lucide-react';
import { authenticatedFetch } from '../../utils/api';

const APP_TYPES = [
  { id: 'claude', name: 'Claude', color: '#D97706' },
  { id: 'codex', name: 'Codex', color: '#10B981' },
  { id: 'gemini', name: 'Gemini', color: '#4285F4' }
];

export default function PromptsManagerContent() {
  const [activeApp, setActiveApp] = useState('claude');
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Dialog states
  const [showDialog, setShowDialog] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    content: '',
    description: ''
  });

  const fetchPrompts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await authenticatedFetch(`/api/cc-switch/prompts?app=${activeApp}`);
      const data = await res.json();

      if (data.prompts) {
        setPrompts(data.prompts);
      }
    } catch (err) {
      console.error('Failed to fetch prompts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeApp]);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const savePrompt = async () => {
    try {
      const prompt = {
        id: editingPrompt?.id,
        app_type: activeApp,
        name: formData.name,
        content: formData.content,
        description: formData.description
      };

      const url = editingPrompt
        ? `/api/cc-switch/prompts/${editingPrompt.id}`
        : '/api/cc-switch/prompts';

      const res = await authenticatedFetch(url, {
        method: editingPrompt ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prompt)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save prompt');
      }

      setShowDialog(false);
      setEditingPrompt(null);
      resetForm();
      fetchPrompts();
    } catch (err) {
      console.error('Failed to save prompt:', err);
      setError(err.message);
    }
  };

  const deletePrompt = async (id) => {
    if (!confirm('Are you sure you want to delete this prompt?')) return;

    try {
      const res = await authenticatedFetch(`/api/cc-switch/prompts/${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete prompt');
      }

      fetchPrompts();
    } catch (err) {
      console.error('Failed to delete prompt:', err);
      setError(err.message);
    }
  };

  const enablePrompt = async (id) => {
    try {
      await authenticatedFetch(`/api/cc-switch/prompts/${id}/enable?app=${activeApp}`, {
        method: 'POST'
      });

      setPrompts(prev => prev.map(p => ({
        ...p,
        is_enabled: p.id === id
      })));
    } catch (err) {
      console.error('Failed to enable prompt:', err);
      setError(err.message);
    }
  };

  const disableAll = async () => {
    try {
      await authenticatedFetch(`/api/cc-switch/prompts/disable-all?app=${activeApp}`, {
        method: 'POST'
      });

      setPrompts(prev => prev.map(p => ({
        ...p,
        is_enabled: false
      })));
    } catch (err) {
      console.error('Failed to disable prompts:', err);
      setError(err.message);
    }
  };

  const openEditDialog = (prompt) => {
    setFormData({
      name: prompt.name,
      content: prompt.content,
      description: prompt.description || ''
    });
    setEditingPrompt(prompt);
    setShowDialog(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      content: '',
      description: ''
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading prompts...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-blue-500" />
          <div>
            <h3 className="text-lg font-medium text-foreground">System Prompts</h3>
            <p className="text-sm text-muted-foreground">Manage system prompts for AI tools</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={disableAll}>
            <Power className="w-4 h-4 mr-2" />
            Disable All
          </Button>
          <Button variant="outline" size="sm" onClick={fetchPrompts} disabled={loading}>
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
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
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

      {/* Add Button */}
      <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }}>
        <Plus className="w-4 h-4 mr-2" />
        Add Prompt
      </Button>

      {/* Prompt List */}
      <div className="space-y-2">
        {prompts.map((prompt) => (
          <div
            key={prompt.id}
            className={`border rounded-lg p-4 transition-all ${
              prompt.is_enabled
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  prompt.is_enabled
                    ? 'bg-green-100 dark:bg-green-900/30'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <FileText className={`w-5 h-5 ${
                    prompt.is_enabled
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-500'
                  }`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{prompt.name}</span>
                    {prompt.is_enabled && (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        Active
                      </Badge>
                    )}
                  </div>
                  {prompt.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {prompt.description}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1 max-w-md truncate">
                    {prompt.content.substring(0, 100)}...
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!prompt.is_enabled && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => enablePrompt(prompt.id)}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Enable
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEditDialog(prompt)}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deletePrompt(prompt.id)}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {prompts.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No prompts configured.</p>
          <p className="text-sm mt-1">Click "Add Prompt" to get started.</p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
          <div className="bg-background border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">
                {editingPrompt ? 'Edit Prompt' : 'Add Prompt'}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => { setShowDialog(false); setEditingPrompt(null); resetForm(); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Custom Prompt"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description (optional)</label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What this prompt does..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Prompt Content</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Enter your system prompt here..."
                  rows={10}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-border">
              <Button variant="outline" onClick={() => { setShowDialog(false); setEditingPrompt(null); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={savePrompt} disabled={!formData.name || !formData.content}>
                {editingPrompt ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
