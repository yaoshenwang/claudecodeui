/**
 * CC-Switch Integration API
 *
 * Provides endpoints to read and switch Claude API providers
 * from the cc-switch SQLite database.
 */

import express from 'express';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

const router = express.Router();

// CC-Switch paths
const CC_SWITCH_DIR = path.join(os.homedir(), '.cc-switch');
const CC_SWITCH_DB = path.join(CC_SWITCH_DIR, 'cc-switch.db');
const CC_SWITCH_SETTINGS = path.join(CC_SWITCH_DIR, 'settings.json');
const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');

/**
 * Check if cc-switch is installed
 */
function isCcSwitchInstalled() {
    try {
        return existsSync(CC_SWITCH_DB);
    } catch {
        return false;
    }
}

/**
 * Get database connection
 */
function getDb() {
    if (!isCcSwitchInstalled()) {
        throw new Error('cc-switch is not installed');
    }
    return new Database(CC_SWITCH_DB, { readonly: false });
}

/**
 * GET /api/cc-switch/status
 * Check if cc-switch is installed and available
 */
router.get('/status', (req, res) => {
    try {
        const installed = isCcSwitchInstalled();
        res.json({
            installed,
            dbPath: installed ? CC_SWITCH_DB : null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cc-switch/providers
 * Get all Claude providers from cc-switch database
 */
router.get('/providers', (req, res) => {
    try {
        const db = getDb();

        const providers = db.prepare(`
            SELECT
                id,
                name,
                settings_config,
                website_url,
                category,
                notes,
                icon,
                icon_color,
                is_current,
                sort_index
            FROM providers
            WHERE app_type = 'claude'
            ORDER BY sort_index ASC, created_at DESC
        `).all();

        db.close();

        // Parse settings_config JSON and mask sensitive tokens
        const result = providers.map(p => {
            let config = {};
            try {
                config = JSON.parse(p.settings_config);
            } catch {}

            // Mask the auth token for security
            if (config.env && config.env.ANTHROPIC_AUTH_TOKEN) {
                const token = config.env.ANTHROPIC_AUTH_TOKEN;
                config.env.ANTHROPIC_AUTH_TOKEN_MASKED =
                    token.substring(0, 8) + '...' + token.substring(token.length - 4);
            }

            return {
                id: p.id,
                name: p.name,
                baseUrl: config.env?.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
                model: config.env?.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
                websiteUrl: p.website_url,
                category: p.category,
                notes: p.notes,
                icon: p.icon,
                iconColor: p.icon_color,
                isCurrent: !!p.is_current,
                sortIndex: p.sort_index
            };
        });

        res.json({ providers: result });
    } catch (error) {
        console.error('Error fetching providers:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cc-switch/current
 * Get the current active provider
 */
router.get('/current', (req, res) => {
    try {
        const db = getDb();

        const provider = db.prepare(`
            SELECT id, name, settings_config, is_current
            FROM providers
            WHERE app_type = 'claude' AND is_current = 1
            LIMIT 1
        `).get();

        db.close();

        if (!provider) {
            return res.json({ current: null });
        }

        let config = {};
        try {
            config = JSON.parse(provider.settings_config);
        } catch {}

        res.json({
            current: {
                id: provider.id,
                name: provider.name,
                baseUrl: config.env?.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
                model: config.env?.ANTHROPIC_MODEL
            }
        });
    } catch (error) {
        console.error('Error fetching current provider:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cc-switch/switch/:providerId
 * Switch to a different provider
 */
router.post('/switch/:providerId', async (req, res) => {
    const { providerId } = req.params;

    try {
        const db = getDb();

        // Get the provider to switch to
        const provider = db.prepare(`
            SELECT id, name, settings_config
            FROM providers
            WHERE app_type = 'claude' AND id = ?
        `).get(providerId);

        if (!provider) {
            db.close();
            return res.status(404).json({ error: 'Provider not found' });
        }

        // Parse settings config
        let config = {};
        try {
            config = JSON.parse(provider.settings_config);
        } catch {
            db.close();
            return res.status(400).json({ error: 'Invalid provider configuration' });
        }

        // Update database: set all providers to not current, then set this one as current
        const updateAll = db.prepare(`
            UPDATE providers SET is_current = 0 WHERE app_type = 'claude'
        `);
        const updateCurrent = db.prepare(`
            UPDATE providers SET is_current = 1 WHERE app_type = 'claude' AND id = ?
        `);

        db.transaction(() => {
            updateAll.run();
            updateCurrent.run(providerId);
        })();

        db.close();

        // Update cc-switch settings.json
        try {
            let settings = {};
            try {
                const settingsContent = await fs.readFile(CC_SWITCH_SETTINGS, 'utf8');
                settings = JSON.parse(settingsContent);
            } catch {}

            settings.currentProviderClaude = providerId;
            await fs.writeFile(CC_SWITCH_SETTINGS, JSON.stringify(settings, null, 2));
        } catch (error) {
            console.error('Error updating cc-switch settings:', error);
        }

        // Write to Claude settings.json
        try {
            // Ensure .claude directory exists
            const claudeDir = path.join(os.homedir(), '.claude');
            await fs.mkdir(claudeDir, { recursive: true });

            // Read existing settings or create new
            let claudeSettings = {};
            try {
                const existingSettings = await fs.readFile(CLAUDE_SETTINGS, 'utf8');
                claudeSettings = JSON.parse(existingSettings);
            } catch {}

            // Update env section with provider config
            claudeSettings.env = {
                ...claudeSettings.env,
                ...config.env
            };

            // Write settings atomically (write to temp file, then rename)
            const tempFile = CLAUDE_SETTINGS + '.tmp';
            await fs.writeFile(tempFile, JSON.stringify(claudeSettings, null, 2));
            await fs.rename(tempFile, CLAUDE_SETTINGS);

            console.log(`Switched to provider: ${provider.name}`);
            console.log(`Settings written to: ${CLAUDE_SETTINGS}`);

        } catch (error) {
            console.error('Error writing Claude settings:', error);
            return res.status(500).json({
                error: 'Failed to write Claude settings',
                details: error.message
            });
        }

        // Also update process environment for immediate effect
        if (config.env) {
            for (const [key, value] of Object.entries(config.env)) {
                process.env[key] = value;
            }
        }

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
        console.error('Error switching provider:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cc-switch/env
 * Get current environment variables from active provider
 */
router.get('/env', (req, res) => {
    try {
        const db = getDb();

        const provider = db.prepare(`
            SELECT settings_config
            FROM providers
            WHERE app_type = 'claude' AND is_current = 1
            LIMIT 1
        `).get();

        db.close();

        if (!provider) {
            return res.json({ env: {} });
        }

        let config = {};
        try {
            config = JSON.parse(provider.settings_config);
        } catch {}

        // Return env without exposing full tokens
        const safeEnv = {};
        if (config.env) {
            for (const [key, value] of Object.entries(config.env)) {
                if (key.includes('TOKEN') || key.includes('KEY')) {
                    safeEnv[key] = value.substring(0, 8) + '...' + value.substring(value.length - 4);
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

export default router;
