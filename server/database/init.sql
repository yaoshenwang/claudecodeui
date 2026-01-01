-- Initialize authentication database
PRAGMA foreign_keys = ON;

-- Users table (single user system)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT 1,
    git_name TEXT,
    git_email TEXT,
    has_completed_onboarding BOOLEAN DEFAULT 0
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- API Keys table for external API access
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key_name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used DATETIME,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

-- User credentials table for storing various tokens/credentials (GitHub, GitLab, etc.)
CREATE TABLE IF NOT EXISTS user_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    credential_name TEXT NOT NULL,
    credential_type TEXT NOT NULL, -- 'github_token', 'gitlab_token', 'bitbucket_token', etc.
    credential_value TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_credentials_user_id ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_type ON user_credentials(credential_type);
CREATE INDEX IF NOT EXISTS idx_user_credentials_active ON user_credentials(is_active);

-- CC-Switch: Providers table for API provider management
CREATE TABLE IF NOT EXISTS cc_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    app_type TEXT NOT NULL DEFAULT 'claude', -- 'claude', 'codex', 'gemini'
    settings_config TEXT NOT NULL DEFAULT '{}', -- JSON config with env variables
    website_url TEXT,
    category TEXT DEFAULT 'custom', -- 'official', 'partner', 'custom'
    notes TEXT,
    icon TEXT,
    icon_color TEXT DEFAULT '#6366f1',
    is_current INTEGER DEFAULT 0,
    sort_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cc_providers_app_type ON cc_providers(app_type);
CREATE INDEX IF NOT EXISTS idx_cc_providers_is_current ON cc_providers(is_current);

-- CC-Switch: Prompts table for system prompt management
CREATE TABLE IF NOT EXISTS cc_prompts (
    id TEXT PRIMARY KEY,
    app_type TEXT NOT NULL DEFAULT 'claude', -- 'claude', 'codex', 'gemini'
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    description TEXT,
    is_enabled INTEGER DEFAULT 0,
    sort_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cc_prompts_app_type ON cc_prompts(app_type);
CREATE INDEX IF NOT EXISTS idx_cc_prompts_enabled ON cc_prompts(is_enabled);

-- CC-Switch: MCP Servers table for unified MCP management
CREATE TABLE IF NOT EXISTS cc_mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    args TEXT DEFAULT '[]', -- JSON array of arguments
    env TEXT DEFAULT '{}', -- JSON object of environment variables
    enabled_claude INTEGER DEFAULT 1,
    enabled_codex INTEGER DEFAULT 0,
    enabled_gemini INTEGER DEFAULT 0,
    description TEXT,
    sort_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cc_mcp_servers_name ON cc_mcp_servers(name);

-- CC-Switch: Skills repositories table
CREATE TABLE IF NOT EXISTS cc_skill_repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    branch TEXT DEFAULT 'main',
    is_enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner, name)
);

-- CC-Switch: Speed test results table
CREATE TABLE IF NOT EXISTS cc_speed_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id TEXT NOT NULL,
    app_type TEXT NOT NULL,
    response_time_ms INTEGER,
    http_status INTEGER,
    status TEXT DEFAULT 'pending', -- 'operational', 'degraded', 'failed', 'pending'
    tested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES cc_providers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cc_speed_tests_provider ON cc_speed_tests(provider_id);
CREATE INDEX IF NOT EXISTS idx_cc_speed_tests_tested_at ON cc_speed_tests(tested_at);

-- CC-Switch: Settings table for app-level settings
CREATE TABLE IF NOT EXISTS cc_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);