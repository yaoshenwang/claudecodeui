/**
 * SkillsManagerContent - Skills Management Component
 *
 * Manage skills across Claude, Codex, and Gemini
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import {
  RefreshCw, Plus, Trash2, Folder, Sparkles, Github, ExternalLink, X
} from 'lucide-react';
import { authenticatedFetch } from '../../utils/api';

const APP_TYPES = [
  { id: 'claude', name: 'Claude', color: '#D97706' },
  { id: 'codex', name: 'Codex', color: '#10B981' },
  { id: 'gemini', name: 'Gemini', color: '#4285F4' }
];

export default function SkillsManagerContent() {
  const [activeApp, setActiveApp] = useState('claude');
  const [skills, setSkills] = useState([]);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Dialog states
  const [showRepoDialog, setShowRepoDialog] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    owner: '',
    name: '',
    branch: 'main'
  });

  const fetchSkills = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await authenticatedFetch(`/api/cc-switch/skills?app=${activeApp}`);
      const data = await res.json();

      if (data.skills) {
        setSkills(data.skills);
      }
    } catch (err) {
      console.error('Failed to fetch skills:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeApp]);

  const fetchRepos = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/cc-switch/skills/repos');
      const data = await res.json();

      if (data.repos) {
        setRepos(data.repos);
      }
    } catch (err) {
      console.error('Failed to fetch repos:', err);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
    fetchRepos();
  }, [fetchSkills, fetchRepos]);

  const addRepo = async () => {
    try {
      const res = await authenticatedFetch('/api/cc-switch/skills/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add repository');
      }

      setShowRepoDialog(false);
      resetForm();
      fetchRepos();
    } catch (err) {
      console.error('Failed to add repo:', err);
      setError(err.message);
    }
  };

  const removeRepo = async (owner, name) => {
    if (!confirm('Are you sure you want to remove this repository?')) return;

    try {
      const res = await authenticatedFetch(`/api/cc-switch/skills/repos/${owner}/${name}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove repository');
      }

      fetchRepos();
    } catch (err) {
      console.error('Failed to remove repo:', err);
      setError(err.message);
    }
  };

  const uninstallSkill = async (directory) => {
    if (!confirm('Are you sure you want to uninstall this skill?')) return;

    try {
      const res = await authenticatedFetch('/api/cc-switch/skills/uninstall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory, app: activeApp })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to uninstall skill');
      }

      fetchSkills();
    } catch (err) {
      console.error('Failed to uninstall skill:', err);
      setError(err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      owner: '',
      name: '',
      branch: 'main'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading skills...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-yellow-500" />
          <div>
            <h3 className="text-lg font-medium text-foreground">Skills Manager</h3>
            <p className="text-sm text-muted-foreground">Manage skills and skill repositories</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchSkills} disabled={loading}>
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

      {/* Installed Skills */}
      <div>
        <h4 className="text-sm font-medium text-foreground mb-3">Installed Skills</h4>
        <div className="space-y-2">
          {skills.map((skill) => (
            <div
              key={skill.key}
              className="border rounded-lg p-4 border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{skill.name}</span>
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        Installed
                      </Badge>
                    </div>
                    {skill.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {skill.description}
                      </div>
                    )}
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Folder className="w-3 h-3" />
                      {skill.directory}
                    </div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => uninstallSkill(skill.directory)}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}

          {skills.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No skills installed for this app.
            </div>
          )}
        </div>
      </div>

      {/* Skill Repositories */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-foreground">Skill Repositories</h4>
          <Button size="sm" variant="outline" onClick={() => setShowRepoDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Repository
          </Button>
        </div>
        <div className="space-y-2">
          {repos.map((repo) => (
            <div
              key={`${repo.owner}/${repo.name}`}
              className="border rounded-lg p-4 border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <Github className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{repo.owner}/{repo.name}</span>
                      {repo.is_enabled && (
                        <Badge variant="outline">Enabled</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Branch: {repo.branch}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => window.open(`https://github.com/${repo.owner}/${repo.name}`, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRepo(repo.owner, repo.name)}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {repos.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No skill repositories configured.
            </div>
          )}
        </div>
      </div>

      {/* Add Repository Modal */}
      {showRepoDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
          <div className="bg-background border border-border rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">Add Skill Repository</h3>
              <Button variant="ghost" size="sm" onClick={() => { setShowRepoDialog(false); resetForm(); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Owner (GitHub username)</label>
                <Input
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  placeholder="anthropics"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Repository Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="claude-skills"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Branch</label>
                <Input
                  value={formData.branch}
                  onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                  placeholder="main"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-border">
              <Button variant="outline" onClick={() => { setShowRepoDialog(false); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={addRepo} disabled={!formData.owner || !formData.name}>
                Add Repository
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
