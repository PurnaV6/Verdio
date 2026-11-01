# Prompt to paste into Claude Desktop (trading-bot project)

Paste this into a new Claude Desktop session, inside a project folder
(e.g. `trading-bot`), after the Alpaca MCP server is configured and Claude
Desktop has been fully restarted.

```
Build me a trading bot in this folder that uses my Alpaca paper account through the Alpaca MCP.

Strategy: moving average crossover on AAPL using daily bars.
- Calculate the 20-day and 50-day simple moving averages of the daily closing price.
- BUY 10 shares when the 20-day crosses above the 50-day and I don't already hold AAPL.
- SELL my whole AAPL position when the 20-day crosses below the 50-day.
- Otherwise HOLD and do nothing.

Check the market once a day, 15 minutes before the close, and log every decision to trades.log.
Paper trading only. Never use a live account.
```

## Tips

- Pick **Sonnet** for this — it's a simple, well-specified task (no need for a heavier model).
- Before running it for real, ask Claude to dry-run / simulate one cycle and show you the
  SMA values and decision logic before it touches the live paper account.
- Have Claude explain how it's scheduling the once-a-day check (e.g. a local cron job /
  launchd task calling a script that opens this conversation isn't realistic — more likely
  it will write you a standalone script that *you* schedule with cron/Task Scheduler, since
  Claude Desktop itself doesn't run unattended on a timer). Ask it to clarify this rather
  than assuming it handles scheduling itself.
