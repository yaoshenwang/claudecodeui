/**
 * CC-Switch Integration API (Read-Only)
 *
 * Simple integration with CC-Switch app:
 * - Read providers list from CC-Switch database
 * - Get current active provider
 * - Switch between providers (updates is_current flag and settings.json)
 */

import express from 'express';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

const router = express.Router();

// Config paths
const HOME_DIR = os.homedir();
const CC_SWITCH_DB_PATH = path.join(HOME_DIR, '.cc-switch', 'cc-switch.db');
const CLAUDE_DIR = path.join(HOME_DIR, '.claude');
const CLAUDE_SETTINGS = path.join(CLAUDE_DIR, 'settings.json');

// Get CC-Switch database connection (read-only from CC-Switch app's database)
function getCCSwitchDb() {
    if (!existsSync(CC_SWITCH_DB_PATH)) {
        return null;
    }
    return new Database(CC_SWITCH_DB_PATH);
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

// Apply provider config to Claude settings.json
async function applyProviderConfig(provider) {
    const config = provider.settings_config || {};
    const env = config.env || {};

    await ensureDir(CLAUDE_DIR);
    const settings = await readJsonFile(CLAUDE_SETTINGS);
    settings.env = { ...settings.env, ...env };
    await writeJsonFile(CLAUDE_SETTINGS, settings);

    // Update process environment for current session
    for (const [key, value] of Object.entries(env)) {
        process.env[key] = value;
    }
}

/**
 * GET /api/cc-switch/status
 * Check if CC-Switch is available
 */
router.get('/status', (req, res) => {
    try {
        const dbExists = existsSync(CC_SWITCH_DB_PATH);
        res.json({
            installed: dbExists,
            version: '1.0.0',
            features: ['providers', 'switch']
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cc-switch/providers
 * Get all providers for an app type (reads from CC-Switch app's database)
 */
router.get('/providers', (req, res) => {
    try {
        const appType = req.query.app || 'claude';
        const db = getCCSwitchDb();

        if (!db) {
            return res.json({ providers: [], error: 'CC-Switch not installed' });
        }

        try {
            const providers = db.prepare(`
                SELECT id, app_type, name, settings_config, website_url, category,
                       created_at, sort_index, notes, icon, icon_color, is_current
                FROM providers
                WHERE app_type = ?
                ORDER BY sort_index ASC, created_at DESC
            `).all(appType);

            db.close();

            // Parse settings_config and mask sensitive tokens
            const result = providers.map(p => {
                let config = {};
                try {
                    config = JSON.parse(p.settings_config || '{}');
                } catch (e) {
                    config = {};
                }

                // Mask sensitive values for display
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
                    is_current: Boolean(p.is_current),
                    baseUrl: config.env?.ANTHROPIC_BASE_URL || config.env?.OPENAI_BASE_URL ||
                             config.env?.GOOGLE_GEMINI_BASE_URL || p.website_url,
                    model: config.env?.ANTHROPIC_MODEL || config.env?.OPENAI_MODEL || config.env?.GEMINI_MODEL
                };
            });

            res.json({ providers: result });
        } catch (dbError) {
            db.close();
            throw dbError;
        }
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
        const db = getCCSwitchDb();

        if (!db) {
            return res.json({ current: null });
        }

        try {
            const provider = db.prepare(`
                SELECT id, name, settings_config, website_url
                FROM providers
                WHERE app_type = ? AND is_current = 1
            `).get(appType);

            db.close();

            if (!provider) {
                return res.json({ current: null });
            }

            let config = {};
            try {
                config = JSON.parse(provider.settings_config || '{}');
            } catch (e) {
                config = {};
            }

            res.json({
                current: {
                    id: provider.id,
                    name: provider.name,
                    baseUrl: config.env?.ANTHROPIC_BASE_URL || config.env?.OPENAI_BASE_URL || provider.website_url,
                    model: config.env?.ANTHROPIC_MODEL || config.env?.OPENAI_MODEL
                }
            });
        } catch (dbError) {
            db.close();
            throw dbError;
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/providers/:id/switch
 * Switch to a provider (updates is_current flag in CC-Switch database and applies config)
 */
router.post('/providers/:id/switch', async (req, res) => {
    try {
        const { id } = req.params;
        const appType = req.query.app || 'claude';
        const db = getCCSwitchDb();

        if (!db) {
            return res.status(500).json({ error: 'CC-Switch not installed' });
        }

        try {
            // Get the provider
            const provider = db.prepare(`
                SELECT * FROM providers WHERE id = ? AND app_type = ?
            `).get(id, appType);

            if (!provider) {
                db.close();
                return res.status(404).json({ error: 'Provider not found' });
            }

            // Update is_current flags
            db.prepare(`UPDATE providers SET is_current = 0 WHERE app_type = ?`).run(appType);
            db.prepare(`UPDATE providers SET is_current = 1 WHERE id = ? AND app_type = ?`).run(id, appType);

            db.close();

            // Parse settings config
            let config = {};
            try {
                config = JSON.parse(provider.settings_config || '{}');
            } catch (e) {
                config = {};
            }

            // Apply config to Claude settings.json
            await applyProviderConfig({ ...provider, settings_config: config });

            res.json({
                success: true,
                provider: {
                    id: provider.id,
                    name: provider.name,
                    baseUrl: config.env?.ANTHROPIC_BASE_URL || config.env?.OPENAI_BASE_URL || provider.website_url,
                    model: config.env?.ANTHROPIC_MODEL || config.env?.OPENAI_MODEL
                },
                message: `Switched to ${provider.name}`
            });
        } catch (dbError) {
            try { db.close(); } catch (e) {}
            throw dbError;
        }
    } catch (error) {
        console.error('Error switching provider:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
