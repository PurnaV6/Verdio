# AAPL Moving-Average Trading Bot (Alpaca MCP + Claude Desktop)

A paper-trading bot driven by Claude Desktop through the Alpaca MCP server.
Claude reads the strategy prompt below, calls the Alpaca MCP tools to check
prices/positions, and places paper trades accordingly. **Paper trading only —
never connect a live account.**

## Strategy

Moving average crossover on AAPL, using daily bars:

- Calculate the 20-day and 50-day simple moving averages (SMA) of the daily closing price.
- **BUY** 10 shares when the 20-day SMA crosses above the 50-day SMA, and you don't already hold AAPL.
- **SELL** the whole AAPL position when the 20-day SMA crosses below the 50-day SMA.
- Otherwise **HOLD** — do nothing.
- Check the market once a day, 15 minutes before close, and log every decision to `trades.log`.

See [`strategy-prompt.md`](./strategy-prompt.md) for the exact prompt to paste into Claude Desktop.

## Setup steps

### 1. Alpaca paper account
1. Sign up at https://alpaca.markets.
2. Switch to **Paper Trading** mode.
3. Open the Paper account's API Keys page and generate a key.
4. Copy the **Key ID** and **Secret Key** right away (the secret is shown once).

### 2. Install the Alpaca MCP server
The Alpaca MCP server runs locally and exposes Alpaca's paper-trading API as MCP tools
for Claude Desktop. Clone/install it per its own instructions, e.g.:

```bash
git clone https://github.com/alpacahq/alpaca-mcp-server.git
cd alpaca-mcp-server
# follow that repo's README to install dependencies (uv/pip) and verify it runs
```

(Pin to whatever revision/fork you've verified — check the README in that repo before trusting it blindly.)

### 3. Configure Claude Desktop
Open (or create) your Claude Desktop MCP config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Use [`claude_desktop_config.example.json`](./claude_desktop_config.example.json) as a
template. Fill in the real paths/keys, and handle one of three cases:

- **File is empty** → paste the whole template in.
- **File already has an `mcpServers` key** → merge in just the `"alpaca"` entry, don't overwrite other servers.
- **File has other unrelated JSON** → add `"alpaca"` under the existing `mcpServers` object (or create that object if missing), keeping existing content intact.

Then **fully quit Claude Desktop (Cmd+Q, not just close the window)** and reopen it so it
picks up the new MCP server.

### 4. Create a project folder and run the prompt
In Claude Desktop, create/open a project folder (e.g. `trading-bot`), start a new session,
and paste the prompt from `strategy-prompt.md`. Claude will write the bot logic, use the
Alpaca MCP tools to check prices and place paper trades, and log decisions to `trades.log`.

### 5. Verify
- Confirm the account shown in Claude's responses is the **paper** account.
- Check `trades.log` after each run for a logged decision (BUY/SELL/HOLD) with reasoning.
- Periodically check your Alpaca paper dashboard to confirm positions match the log.

## Safety notes

- This is **not financial advice**. It's a simple educational strategy.
- Paper trading only. Do not point this at a live account.
- Nothing here should run unattended against real money without much more testing,
  risk limits, and monitoring.
