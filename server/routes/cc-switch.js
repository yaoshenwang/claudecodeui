/**
 * CC-Switch Complete Integration API
 *
 * Full implementation of cc-switch functionality:
 * - Provider management (CRUD, switch, import/export)
 * - Prompts management
 * - MCP server management
 * - Skills management
 * - Speed testing
 * - Settings and configuration
 */

import express from 'express';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { ccProvidersDb, ccPromptsDb, ccMcpServersDb, ccSkillReposDb, ccSpeedTestsDb, ccSettingsDb } from '../database/db.js';

const router = express.Router();

// Config paths
const HOME_DIR = os.homedir();
const CC_SWITCH_DIR = path.join(HOME_DIR, '.cc-switch');
const CLAUDE_DIR = path.join(HOME_DIR, '.claude');
const CODEX_DIR = path.join(HOME_DIR, '.codex');
const GEMINI_DIR = path.join(HOME_DIR, '.gemini');

const CLAUDE_SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const CODEX_CONFIG = path.join(CODEX_DIR, 'config.toml');
const GEMINI_SETTINGS = path.join(GEMINI_DIR, 'settings.json');

// Utility functions
function generateId() {
    return crypto.randomUUID();
}

async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

async function readJsonFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch {
        return {};
    }
}

async function writeJsonFile(filePath, data) {
    await ensureDir(path.dirname(filePath));
    const tempFile = filePath + '.tmp';
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
    await fs.rename(tempFile, filePath);
}

// Apply provider config to app settings files
async function applyProviderConfig(provider, appType = 'claude') {
    const config = provider.settings_config || {};
    const env = config.env || {};

    if (appType === 'claude') {
        await ensureDir(CLAUDE_DIR);
        const settings = await readJsonFile(CLAUDE_SETTINGS);
        settings.env = { ...settings.env, ...env };
        await writeJsonFile(CLAUDE_SETTINGS, settings);

        // Update process environment
        for (const [key, value] of Object.entries(env)) {
            process.env[key] = value;
        }
    } else if (appType === 'codex') {
        await ensureDir(CODEX_DIR);
        // Codex uses TOML config
        if (config.configToml) {
            await fs.writeFile(CODEX_CONFIG, config.configToml);
        }
        // Also update auth.json if needed
        if (env.OPENAI_API_KEY) {
            const authPath = path.join(CODEX_DIR, 'auth.json');
            await writeJsonFile(authPath, { api_key: env.OPENAI_API_KEY });
        }
    } else if (appType === 'gemini') {
        await ensureDir(GEMINI_DIR);
        const settings = await readJsonFile(GEMINI_SETTINGS);
        settings.env = { ...settings.env, ...env };
        await writeJsonFile(GEMINI_SETTINGS, settings);

        // Also update .env file for Gemini
        const envPath = path.join(GEMINI_DIR, '.env');
        const envLines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
        await fs.writeFile(envPath, envLines.join('\n'));
    }
}

// ============================================
// PROVIDERS API
// ============================================

/**
 * GET /api/cc-switch/status
 * Check system status
 */
router.get('/status', (req, res) => {
    try {
        res.json({
            installed: true,
            version: '1.0.0',
            features: ['providers', 'prompts', 'mcp', 'skills', 'speed-test', 'import-export']
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cc-switch/providers
 * Get all providers for an app type
 */
router.get('/providers', (req, res) => {
    try {
        const appType = req.query.app || 'claude';
        const providers = ccProvidersDb.getAll(appType);

        // Mask sensitive tokens
        const result = providers.map(p => {
            const config = p.settings_config || {};
            const maskedConfig = { ...config };

            if (maskedConfig.env) {
                maskedConfig.env = { ...maskedConfig.env };
                for (const key of Object.keys(maskedConfig.env)) {
                    if (key.includes('TOKEN') || key.includes('KEY') || key.includes('SECRET')) {
                        const value = maskedConfig.env[key];
                        if (value && value.length > 12) {
                            maskedConfig.env[key + '_MASKED'] = value.substring(0, 8) + '...' + value.substring(value.length - 4);
                            delete maskedConfig.env[key];
                        }
                    }
                }
            }

            return {
                ...p,
                settings_config: maskedConfig,
                baseUrl: config.env?.ANTHROPIC_BASE_URL || config.env?.OPENAI_BASE_URL || config.env?.GOOGLE_GEMINI_BASE_URL,
                model: config.env?.ANTHROPIC_MODEL || config.env?.OPENAI_MODEL || config.env?.GEMINI_MODEL
            };
        });

        res.json({ providers: result });
    } catch (error) {
        console.error('Error fetching providers:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cc-switch/providers/current
 * Get current active provider
 */
router.get('/providers/current', (req, res) => {
    try {
        const appType = req.query.app || 'claude';
        const provider = ccProvidersDb.getCurrent(appType);

        if (!provider) {
            return res.json({ current: null });
        }

        const config = provider.settings_config || {};
        res.json({
            current: {
                id: provider.id,
                name: provider.name,
                baseUrl: config.env?.ANTHROPIC_BASE_URL || config.env?.OPENAI_BASE_URL,
                model: config.env?.ANTHROPIC_MODEL || config.env?.OPENAI_MODEL
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/providers
 * Create or update a provider
 */
router.post('/providers', (req, res) => {
    try {
        const provider = req.body;
        if (!provider.id) {
            provider.id = generateId();
        }
        if (!provider.name) {
            return res.status(400).json({ error: 'Provider name is required' });
        }

        const result = ccProvidersDb.upsert(provider);
        res.json({ success: true, provider: { id: result.id } });
    } catch (error) {
        console.error('Error creating provider:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/cc-switch/providers/:id
 * Update a provider
 */
router.put('/providers/:id', (req, res) => {
    try {
        const { id } = req.params;
        const provider = { ...req.body, id };

        const result = ccProvidersDb.upsert(provider);
        res.json({ success: true, provider: { id: result.id } });
    } catch (error) {
        console.error('Error updating provider:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/cc-switch/providers/:id
 * Delete a provider
 */
router.delete('/providers/:id', (req, res) => {
    try {
        const { id } = req.params;
        const deleted = ccProvidersDb.delete(id);

        if (!deleted) {
            return res.status(404).json({ error: 'Provider not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/providers/:id/switch
 * Switch to a provider
 */
router.post('/providers/:id/switch', async (req, res) => {
    try {
        const { id } = req.params;
        const appType = req.query.app || 'claude';

        const provider = ccProvidersDb.getById(id);
        if (!provider) {
            return res.status(404).json({ error: 'Provider not found' });
        }

        // Update database
        ccProvidersDb.switchTo(id, appType);

        // Apply config to app settings
        await applyProviderConfig(provider, appType);

        const config = provider.settings_config || {};
        res.json({
            success: true,
            provider: {
                id: provider.id,
                name: provider.name,
                baseUrl: config.env?.ANTHROPIC_BASE_URL || config.env?.OPENAI_BASE_URL,
                model: config.env?.ANTHROPIC_MODEL || config.env?.OPENAI_MODEL
            },
            message: `Switched to ${provider.name}`
        });
    } catch (error) {
        console.error('Error switching provider:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/cc-switch/providers/sort
 * Update provider sort order
 */
router.put('/providers/sort', (req, res) => {
    try {
        const { updates } = req.body; // [{ id, sortIndex }]
        ccProvidersDb.updateSortOrder(updates);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Legacy endpoint for backward compatibility
router.get('/current', (req, res) => {
    try {
        const provider = ccProvidersDb.getCurrent('claude');

        if (!provider) {
            return res.json({ current: null });
        }

        const config = provider.settings_config || {};
        res.json({
            current: {
                id: provider.id,
                name: provider.name,
                baseUrl: config.env?.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
                model: config.env?.ANTHROPIC_MODEL
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Legacy switch endpoint
router.post('/switch/:providerId', async (req, res) => {
    try {
        const { providerId } = req.params;

        const provider = ccProvidersDb.getById(providerId);
        if (!provider) {
            return res.status(404).json({ error: 'Provider not found' });
        }

        ccProvidersDb.switchTo(providerId, 'claude');
        await applyProviderConfig(provider, 'claude');

        const config = provider.settings_config || {};
        res.json({
            success: true,
            provider: {
                id: provider.id,
                name: provider.name,
                baseUrl: config.env?.ANTHROPIC_BASE_URL,
                model: config.env?.ANTHROPIC_MODEL
            },
            message: `Switched to ${provider.name}`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PROMPTS API
// ============================================

/**
 * GET /api/cc-switch/prompts
 * Get all prompts for an app
 */
router.get('/prompts', (req, res) => {
    try {
        const appType = req.query.app || 'claude';
        const prompts = ccPromptsDb.getAll(appType);
        res.json({ prompts });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cc-switch/prompts/current
 * Get currently enabled prompt
 */
router.get('/prompts/current', (req, res) => {
    try {
        const appType = req.query.app || 'claude';
        const prompt = ccPromptsDb.getEnabled(appType);
        res.json({ prompt });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/prompts
 * Create or update a prompt
 */
router.post('/prompts', (req, res) => {
    try {
        const prompt = req.body;
        if (!prompt.id) {
            prompt.id = generateId();
        }
        if (!prompt.name || !prompt.content) {
            return res.status(400).json({ error: 'Prompt name and content are required' });
        }

        const result = ccPromptsDb.upsert(prompt);
        res.json({ success: true, prompt: { id: result.id } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/cc-switch/prompts/:id
 * Update a prompt
 */
router.put('/prompts/:id', (req, res) => {
    try {
        const { id } = req.params;
        const prompt = { ...req.body, id };

        const result = ccPromptsDb.upsert(prompt);
        res.json({ success: true, prompt: { id: result.id } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/cc-switch/prompts/:id
 * Delete a prompt
 */
router.delete('/prompts/:id', (req, res) => {
    try {
        const { id } = req.params;
        const deleted = ccPromptsDb.delete(id);

        if (!deleted) {
            return res.status(404).json({ error: 'Prompt not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/prompts/:id/enable
 * Enable a prompt (disables others)
 */
router.post('/prompts/:id/enable', async (req, res) => {
    try {
        const { id } = req.params;
        const appType = req.query.app || 'claude';

        ccPromptsDb.enable(id, appType);

        // Apply to app settings if needed
        const prompt = ccPromptsDb.getEnabled(appType);
        if (prompt && appType === 'claude') {
            const settings = await readJsonFile(CLAUDE_SETTINGS);
            settings.systemPrompt = prompt.content;
            await writeJsonFile(CLAUDE_SETTINGS, settings);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/prompts/disable-all
 * Disable all prompts
 */
router.post('/prompts/disable-all', async (req, res) => {
    try {
        const appType = req.query.app || 'claude';
        ccPromptsDb.disableAll(appType);

        // Remove from app settings
        if (appType === 'claude') {
            const settings = await readJsonFile(CLAUDE_SETTINGS);
            delete settings.systemPrompt;
            await writeJsonFile(CLAUDE_SETTINGS, settings);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// MCP SERVERS API
// ============================================

/**
 * GET /api/cc-switch/mcp
 * Get all MCP servers
 */
router.get('/mcp', (req, res) => {
    try {
        const servers = ccMcpServersDb.getAll();
        res.json({ servers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cc-switch/mcp/:app
 * Get MCP servers enabled for an app
 */
router.get('/mcp/:app', (req, res) => {
    try {
        const { app } = req.params;
        const servers = ccMcpServersDb.getForApp(app);
        res.json({ servers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/mcp
 * Create or update MCP server
 */
router.post('/mcp', (req, res) => {
    try {
        const server = req.body;
        if (!server.id) {
            server.id = generateId();
        }
        if (!server.name || !server.command) {
            return res.status(400).json({ error: 'Server name and command are required' });
        }

        const result = ccMcpServersDb.upsert(server);
        res.json({ success: true, server: { id: result.id } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/cc-switch/mcp/:id
 * Update MCP server
 */
router.put('/mcp/:id', (req, res) => {
    try {
        const { id } = req.params;
        const server = { ...req.body, id };

        const result = ccMcpServersDb.upsert(server);
        res.json({ success: true, server: { id: result.id } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/cc-switch/mcp/:id
 * Delete MCP server
 */
router.delete('/mcp/:id', (req, res) => {
    try {
        const { id } = req.params;
        const deleted = ccMcpServersDb.delete(id);

        if (!deleted) {
            return res.status(404).json({ error: 'MCP server not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/mcp/:id/toggle
 * Toggle MCP server for an app
 */
router.post('/mcp/:id/toggle', (req, res) => {
    try {
        const { id } = req.params;
        const { app, enabled } = req.body;

        if (!['claude', 'codex', 'gemini'].includes(app)) {
            return res.status(400).json({ error: 'Invalid app type' });
        }

        ccMcpServersDb.toggleApp(id, app, enabled);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/mcp/sync
 * Sync MCP config to app settings files
 */
router.post('/mcp/sync', async (req, res) => {
    try {
        const { app } = req.body;
        const appType = app || 'claude';

        const servers = ccMcpServersDb.getForApp(appType);

        // Convert to app-specific format
        const mcpServers = {};
        for (const server of servers) {
            mcpServers[server.name] = {
                command: server.command,
                args: server.args,
                env: server.env
            };
        }

        if (appType === 'claude') {
            const settings = await readJsonFile(CLAUDE_SETTINGS);
            settings.mcpServers = mcpServers;
            await writeJsonFile(CLAUDE_SETTINGS, settings);
        }

        res.json({ success: true, count: servers.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SKILLS API
// ============================================

/**
 * GET /api/cc-switch/skills
 * Get all skills for an app
 */
router.get('/skills', async (req, res) => {
    try {
        const appType = req.query.app || 'claude';
        const skillsDir = appType === 'claude'
            ? path.join(HOME_DIR, '.claude', 'skills')
            : path.join(HOME_DIR, `.${appType}`, 'skills');

        const skills = [];

        if (existsSync(skillsDir)) {
            const entries = await fs.readdir(skillsDir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const skillPath = path.join(skillsDir, entry.name);
                    const manifestPath = path.join(skillPath, 'skill.json');

                    let manifest = { name: entry.name };
                    if (existsSync(manifestPath)) {
                        try {
                            manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
                        } catch {}
                    }

                    skills.push({
                        key: entry.name,
                        name: manifest.name || entry.name,
                        description: manifest.description || '',
                        directory: skillPath,
                        installed: true
                    });
                }
            }
        }

        res.json({ skills });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cc-switch/skills/repos
 * Get skill repositories
 */
router.get('/skills/repos', (req, res) => {
    try {
        const repos = ccSkillReposDb.getAll();
        res.json({ repos });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/skills/repos
 * Add skill repository
 */
router.post('/skills/repos', (req, res) => {
    try {
        const { owner, name, branch = 'main' } = req.body;

        if (!owner || !name) {
            return res.status(400).json({ error: 'Owner and name are required' });
        }

        const result = ccSkillReposDb.add(owner, name, branch);
        res.json({ success: true, id: result.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/cc-switch/skills/repos/:owner/:name
 * Remove skill repository
 */
router.delete('/skills/repos/:owner/:name', (req, res) => {
    try {
        const { owner, name } = req.params;
        const deleted = ccSkillReposDb.remove(owner, name);

        if (!deleted) {
            return res.status(404).json({ error: 'Repository not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/skills/install
 * Install a skill from a directory
 */
router.post('/skills/install', async (req, res) => {
    try {
        const { directory, app = 'claude' } = req.body;

        if (!directory) {
            return res.status(400).json({ error: 'Directory is required' });
        }

        const skillsDir = path.join(HOME_DIR, `.${app}`, 'skills');
        await ensureDir(skillsDir);

        const skillName = path.basename(directory);
        const targetDir = path.join(skillsDir, skillName);

        // Copy skill files
        await fs.cp(directory, targetDir, { recursive: true });

        res.json({ success: true, installed: targetDir });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/skills/uninstall
 * Uninstall a skill
 */
router.post('/skills/uninstall', async (req, res) => {
    try {
        const { directory, app = 'claude' } = req.body;

        if (!directory) {
            return res.status(400).json({ error: 'Directory is required' });
        }

        await fs.rm(directory, { recursive: true, force: true });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SPEED TEST API
// ============================================

/**
 * POST /api/cc-switch/speed-test
 * Test provider speed
 */
router.post('/speed-test', async (req, res) => {
    try {
        const { providerId, app = 'claude' } = req.body;

        const provider = ccProvidersDb.getById(providerId);
        if (!provider) {
            return res.status(404).json({ error: 'Provider not found' });
        }

        const config = provider.settings_config || {};
        const env = config.env || {};

        // Determine endpoint to test
        let testUrl = 'https://api.anthropic.com/v1/messages';
        let apiKey = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY;

        if (app === 'codex') {
            testUrl = env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
            apiKey = env.OPENAI_API_KEY;
        } else if (app === 'gemini') {
            testUrl = env.GOOGLE_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/models';
            apiKey = env.GOOGLE_API_KEY;
        } else if (env.ANTHROPIC_BASE_URL) {
            testUrl = env.ANTHROPIC_BASE_URL + '/v1/messages';
        }

        const startTime = Date.now();
        let status = 'failed';
        let httpStatus = 0;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(testUrl, {
                method: 'HEAD',
                headers: {
                    'x-api-key': apiKey || '',
                    'Authorization': `Bearer ${apiKey || ''}`
                },
                signal: controller.signal
            });

            clearTimeout(timeout);
            httpStatus = response.status;

            if (response.status < 500) {
                status = 'operational';
            } else {
                status = 'degraded';
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                status = 'degraded';
            } else {
                status = 'failed';
            }
        }

        const responseTime = Date.now() - startTime;

        // Save result
        ccSpeedTestsDb.save(providerId, app, responseTime, httpStatus, status);

        res.json({
            success: true,
            result: {
                providerId,
                providerName: provider.name,
                status,
                responseTime,
                httpStatus,
                testedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/speed-test/all
 * Test all providers
 */
router.post('/speed-test/all', async (req, res) => {
    try {
        const { app = 'claude' } = req.body;
        const providers = ccProvidersDb.getAll(app);

        const results = [];

        for (const provider of providers) {
            const config = provider.settings_config || {};
            const env = config.env || {};

            let testUrl = 'https://api.anthropic.com/v1/messages';
            let apiKey = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY;

            if (env.ANTHROPIC_BASE_URL) {
                testUrl = env.ANTHROPIC_BASE_URL + '/v1/messages';
            }

            const startTime = Date.now();
            let status = 'failed';
            let httpStatus = 0;

            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);

                const response = await fetch(testUrl, {
                    method: 'HEAD',
                    headers: {
                        'x-api-key': apiKey || '',
                        'Authorization': `Bearer ${apiKey || ''}`
                    },
                    signal: controller.signal
                });

                clearTimeout(timeout);
                httpStatus = response.status;
                status = response.status < 500 ? 'operational' : 'degraded';
            } catch {
                status = 'failed';
            }

            const responseTime = Date.now() - startTime;

            ccSpeedTestsDb.save(provider.id, app, responseTime, httpStatus, status);

            results.push({
                providerId: provider.id,
                providerName: provider.name,
                status,
                responseTime,
                httpStatus
            });
        }

        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cc-switch/speed-test/results
 * Get latest speed test results
 */
router.get('/speed-test/results', (req, res) => {
    try {
        const app = req.query.app || 'claude';
        const results = ccSpeedTestsDb.getLatest(app);
        res.json({ results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// IMPORT/EXPORT API
// ============================================

/**
 * GET /api/cc-switch/export
 * Export all configuration
 */
router.get('/export', (req, res) => {
    try {
        const providers = {
            claude: ccProvidersDb.getAll('claude'),
            codex: ccProvidersDb.getAll('codex'),
            gemini: ccProvidersDb.getAll('gemini')
        };

        const prompts = {
            claude: ccPromptsDb.getAll('claude'),
            codex: ccPromptsDb.getAll('codex'),
            gemini: ccPromptsDb.getAll('gemini')
        };

        const mcpServers = ccMcpServersDb.getAll();
        const skillRepos = ccSkillReposDb.getAll();
        const settings = ccSettingsDb.getAll();

        const exportData = {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            providers,
            prompts,
            mcpServers,
            skillRepos,
            settings
        };

        res.json(exportData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/import
 * Import configuration
 */
router.post('/import', (req, res) => {
    try {
        const data = req.body;

        if (!data.version) {
            return res.status(400).json({ error: 'Invalid import data' });
        }

        let imported = { providers: 0, prompts: 0, mcpServers: 0, skillRepos: 0 };

        // Import providers
        if (data.providers) {
            for (const appType of ['claude', 'codex', 'gemini']) {
                if (data.providers[appType]) {
                    for (const provider of data.providers[appType]) {
                        ccProvidersDb.upsert({ ...provider, app_type: appType });
                        imported.providers++;
                    }
                }
            }
        }

        // Import prompts
        if (data.prompts) {
            for (const appType of ['claude', 'codex', 'gemini']) {
                if (data.prompts[appType]) {
                    for (const prompt of data.prompts[appType]) {
                        ccPromptsDb.upsert({ ...prompt, app_type: appType });
                        imported.prompts++;
                    }
                }
            }
        }

        // Import MCP servers
        if (data.mcpServers) {
            for (const server of data.mcpServers) {
                ccMcpServersDb.upsert(server);
                imported.mcpServers++;
            }
        }

        // Import skill repos
        if (data.skillRepos) {
            for (const repo of data.skillRepos) {
                ccSkillReposDb.add(repo.owner, repo.name, repo.branch);
                imported.skillRepos++;
            }
        }

        // Import settings
        if (data.settings) {
            for (const [key, value] of Object.entries(data.settings)) {
                ccSettingsDb.set(key, value);
            }
        }

        res.json({ success: true, imported });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SETTINGS API
// ============================================

/**
 * GET /api/cc-switch/settings
 * Get all settings
 */
router.get('/settings', (req, res) => {
    try {
        const settings = ccSettingsDb.getAll();
        res.json({ settings });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/cc-switch/settings/:key
 * Update a setting
 */
router.put('/settings/:key', (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        ccSettingsDb.set(key, value);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cc-switch/env
 * Get current environment from active provider
 */
router.get('/env', (req, res) => {
    try {
        const appType = req.query.app || 'claude';
        const provider = ccProvidersDb.getCurrent(appType);

        if (!provider) {
            return res.json({ env: {} });
        }

        const config = provider.settings_config || {};
        const safeEnv = {};

        if (config.env) {
            for (const [key, value] of Object.entries(config.env)) {
                if (key.includes('TOKEN') || key.includes('KEY') || key.includes('SECRET')) {
                    if (value && value.length > 12) {
                        safeEnv[key] = value.substring(0, 8) + '...' + value.substring(value.length - 4);
                    }
                } else {
                    safeEnv[key] = value;
                }
            }
        }

        res.json({ env: safeEnv });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// DEFAULT PROVIDERS
// ============================================

/**
 * POST /api/cc-switch/providers/import-defaults
 * Import default provider configurations
 */
router.post('/providers/import-defaults', (req, res) => {
    try {
        const defaults = [
            {
                id: 'anthropic-official',
                name: 'Anthropic Official',
                app_type: 'claude',
                category: 'official',
                icon: 'A',
                icon_color: '#D97706',
                settings_config: {
                    env: {
                        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
                        ANTHROPIC_MODEL: 'claude-sonnet-4-20250514'
                    }
                }
            },
            {
                id: 'openai-official',
                name: 'OpenAI Official',
                app_type: 'codex',
                category: 'official',
                icon: 'O',
                icon_color: '#10B981',
                settings_config: {
                    env: {
                        OPENAI_BASE_URL: 'https://api.openai.com/v1',
                        OPENAI_MODEL: 'gpt-4o'
                    }
                }
            },
            {
                id: 'google-official',
                name: 'Google Official',
                app_type: 'gemini',
                category: 'official',
                icon: 'G',
                icon_color: '#4285F4',
                settings_config: {
                    env: {
                        GOOGLE_GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com',
                        GEMINI_MODEL: 'gemini-2.0-flash'
                    }
                }
            }
        ];

        let imported = 0;
        for (const provider of defaults) {
            // Only import if not exists
            const existing = ccProvidersDb.getById(provider.id);
            if (!existing) {
                ccProvidersDb.upsert(provider);
                imported++;
            }
        }

        res.json({ success: true, imported });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
