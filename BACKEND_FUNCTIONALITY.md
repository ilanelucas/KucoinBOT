# Backend Functionality

## 1. Overview

The backend serves two primary purposes:
1.  To run an automated trading bot (`backend/botV0.py`) that interacts with the KuCoin Futures exchange using the `ccxt` library.
2.  To provide a web interface (`backend/app.py`) built with Flask and Socket.IO, allowing users to monitor, control, and receive real-time updates from the trading bot.

## 2. Core Trading Bot (`backend/botV0.py`)

### a. Initialization and Configuration

-   **API Keys**: Securely loaded using `python-dotenv` from a `.env` file and accessed via `os.getenv()`. This typically includes `KUCOIN_API_KEY`, `KUCOIN_API_SECRET`, and `KUCOIN_API_PASSPHRASE`.
-   **Initial Parameters**:
    -   `INITIAL_BALANCE`: The starting balance for trading simulations or live trading.
    -   `BASE_LEVERAGE` and `MAX_LEVERAGE`: Define the initial and maximum leverage to be used.
    -   `RISK_PER_TRADE`: The percentage of the account balance to risk on a single trade.
    -   `MAX_POSITIONS`: The maximum number of concurrent open positions.
    -   `PAIRS`: A list of trading pairs to be monitored and traded (e.g., `['BTC/USDT', 'ETH/USDT']`).
-   **Exchange Instance**: An instance of `ccxt.kucoinfutures` is created with the loaded API keys and sandbox mode configuration if applicable.
-   **Data Persistence**:
    -   Performance history is loaded from and saved to `historique_performance.json` (located in the root directory).
    -   Daily reports are loaded from and saved to `rapport_quotidien.json` (located in the root directory).
    -   Individual trade details are logged to `journal_trades.csv` (located in the root directory).

### b. Market Analysis and Indicators

-   **OHLCV Data**: Fetched using `recuperer_ohlcv(pair, timeframe, limit)` which retrieves Open, High, Low, Close, Volume data for specified pairs and timeframes. A caching mechanism (`self.cache_donnees`) is implemented within the bot class to store and reuse this data, reducing API calls.
-   **Pair Analysis (`analyser_paires`)**: Iterates through `PAIRS`, fetches OHLCV data for multiple timeframes (e.g., 1h, 4h, 1d), calculates indicators, and then scores each pair based on potential trading opportunities.
-   **Key Technical Indicators (`calculer_indicateurs`)**:
    -   **EMAs (Exponential Moving Averages)**: Calculated for various periods (e.g., 9, 21, 50, 100, 200).
    -   **Bollinger Bands**: Including upper band, middle band (SMA), and lower band.
    -   **RSI (Relative Strength Index)**.
    -   **MACD (Moving Average Convergence Divergence)**: Including MACD line, signal line, and histogram.
    -   **ATR (Average True Range)**: Used for volatility assessment and setting SL/TP.
    -   **Momentum**: Standard momentum indicator.
    -   **Candlestick Patterns (`identifier_patterns_chandeliers`)**: This method within the `BotScalpingAvance` class implements its own logic to identify various bullish and bearish patterns (e.g., Doji, Hammer, Engulfing, Marubozu) by analyzing OHLC data directly, rather than solely relying on an external library like `talib` for this specific complex pattern recognition in the visible code.
    -   **Support/Resistance Levels**: Derived from rolling window maximums (`df['high_max']`) and minimums (`df['low_min']`) of price data, indicating recent swing highs and lows.

### c. Trading Strategy and Signals

-   **Signal Generation (`verifier_signaux`)**: This is a complex function that combines multiple factors:
    -   **Trend Analysis**: Using EMAs (e.g., EMA 50 above EMA 100 for uptrend).
    -   **Momentum**: RSI levels (e.g., above 50 for bullish momentum) and MACD crossovers.
    -   **Volume Confirmation**: Checking if volume supports the potential trade.
    -   **MACD Signals**: Bullish/bearish crossovers and histogram divergence.
    -   **Bollinger Bands**: Breakouts above the upper band or below the lower band, or squeezes indicating potential volatility changes.
    -   **Candlestick Patterns**: Using identified patterns from `identifier_patterns_chandeliers` as confirmation or primary signals.
    -   **Divergences**: Looking for bullish or bearish divergences between price and indicators like RSI or MACD.
-   **Scoring System**: Signals are often assigned a score based on the confluence of indicators and patterns. A higher score indicates a stronger signal.
-   **Multi-Timeframe Analysis (`analyser_conditions_marche`)**: The bot analyzes market conditions across different timeframes (e.g., 15m, 1h, 4h, 1d). Trend alignment across these timeframes (e.g., uptrend on 1h and 4h) strengthens the confidence in a signal.

### d. Risk Management

-   **Dynamic Leverage Adjustment (`ajuster_levier_et_niveaux`)**: Leverage is dynamically adjusted based on current account balance, number of open positions, market conditions (e.g., ranging vs. trending, identified by indicators), and overall market volatility (e.g., from ATR).
-   **Stop-Loss (SL) and Take-Profit (TP) Calculation**:
    -   SL is typically set based on ATR (e.g., 1.5 * ATR below entry for long) or key price levels (e.g., below recent swing low).
    -   TP is often set based on a risk/reward ratio (e.g., 2:1 or 3:1 compared to SL) or at significant resistance/support levels.
-   **Position Sizing**: Calculated based on `RISK_PER_TRADE`, account balance, and the distance to the stop-loss, ensuring that a single losing trade does not exceed the predefined risk percentage.
-   **Trailing Stops**: SL can be trailed behind the price as a trade moves into profit to lock in gains.
-   **Move SL to Break-Even**: Once a trade reaches a certain profit target (e.g., 1:1 risk/reward), the SL might be moved to the entry price.
-   **Partial Profit Taking**: The bot may close portions of a position at different TP levels.

### e. Order Execution and Position Management

-   **Trade Execution (`executer_trade`)**:
    -   Places market or limit orders for `long` (buy), `short` (sell), and `close` operations via the `ccxt` exchange instance.
    -   Handles order parameters like pair, type, side, amount, price, and leverage.
-   **Open Position Management (`gerer_positions_ouvertes`)**:
    -   Periodically checks if open positions have hit their SL or TP levels.
    -   Monitors for stagnant positions (trades not moving significantly for a defined period) and may close them.
    -   Re-evaluates positions if the overall market trend changes significantly against the trade's direction.
-   **Fee Calculation (`calculer_frais`)**: Calculates trading fees based on KuCoin's fee structure, which is important for accurate PnL reporting.

### f. Performance Tracking and Logging

-   **Trade Recording**:
    -   `historique_performance.json`: Stores aggregated performance metrics over time. The generation of daily report summaries (`rapport_quotidien.json`) is handled within the `_sauvegarder_historique_performance` method, which updates both files.
    -   `journal_trades.csv`: Logs details of each individual trade (entry/exit price, size, PnL, fees, etc.).
-   **Metrics Tracked**:
    -   Profit and Loss (PnL) - total and per trade.
    -   Win Rate.
    -   Return on Investment (ROI).
    -   Maximum Drawdown.
    -   Sharpe Ratio.
    -   Best and Worst Trades.
    -   Winning and Losing Streaks.
-   **Logging**: Utilizes Python's `logging` module. A logger is configured with both a file handler (writing to `trading_bot_<timestamp>.log`) and a console handler, recording bot operations, errors, and important events.

### g. Concurrency

-   **Threading**: Employs `threading` for background tasks to ensure the main bot loop and Flask app remain responsive.
    -   `analyser_marche_periodiquement`: A thread that periodically runs market analysis (`analyser_paires`).
    -   `gerer_positions_periodiquement`: A thread that periodically manages open positions.

## 3. Web Interface Backend (`backend/app.py`)

### a. Flask Application Setup

-   **Initialization**: Initializes the Flask app (`app = Flask(__name__)`) and integrates Flask-SocketIO (`socketio = SocketIO(app)`).
-   **Configuration**:
    -   Sets up template folder (`template_folder='../frontend/templates'`).
    -   Sets up static folder (`static_folder='../frontend/static'`).
    -   May configure other Flask settings like `SECRET_KEY`.

### b. Bot Control Endpoints

-   **`/api/start` (POST)**:
    -   The `start_bot_thread()` function is invoked. This function creates a new instance of `BotScalpingAvance` from `backend.botV0` and then calls the `run()` method of this instance within a new daemon thread. This allows the bot to operate in the background without blocking the Flask application.
-   **`/api/stop` (POST)**:
    -   The `stop_bot()` function sets the `bot_instance.running` attribute to `False`. This signals the bot's main operational loop (within the `run()` method) to terminate gracefully. The function also performs cleanup actions like joining the bot thread.
-   **`/api/status` (GET)**:
    -   Returns the current running status of the bot (e.g., `{'is_running': bot_instance.running if bot_instance else False}`).
-   **`/api/close_position` (POST)**:
    -   Allows manual closure of an open position. It receives the `symbol` (trading pair) from the request. The endpoint determines if there's an open long or short position for that `symbol` by checking `bot_instance.positions_ouvertes`. If a position is found, `app.py` then calls `bot_instance.executer_trade(symbole=symbol, action=action, prix=None, levier=position_details['levier'])`.
        -   `action` is determined as "CLOSE_LONG" or "CLOSE_SHORT" based on the existing position's side.
        -   `prix` is passed as `None`, signaling `executer_trade` to use the current market price for closure.
        -   `levier` is taken from `position_details['levier']`, the leverage of the existing position.
        -   The `quantite` for closing is not explicitly passed in this call from `app.py`; it is handled internally by `executer_trade` which looks up the quantity of the open position for the given `symbol` when the action is "CLOSE_LONG" or "CLOSE_SHORT".

### c. Data Provisioning for UI

-   **`/api/data` (GET)**:
    -   The `get_bot_data()` function (within `app.py`) is called. This function accesses various attributes of the active `bot_instance` (if it exists and is running), such as open positions, performance history, logs, balance information, and market analysis data.
    -   **Caching and Hash Checking**: To optimize performance and reduce data transfer, the endpoint implements a caching mechanism. It stores a hash (`last_data_hash`) of the previously sent data and only sends the full dataset if the current data's hash has changed. Otherwise, it returns a 304 "Not Modified" status.
-   **`/api/system_status` (GET)**:
    -   Provides system metrics such as bot uptime, CPU usage, and memory usage, often using libraries like `psutil`.

### d. Real-time Updates (Socket.IO)

-   **Socket.IO Events**:
    -   `data_update`: Emitted periodically by a background task to push the latest bot data (retrieved via `get_bot_data()`) to connected clients.
    -   `data_ping`: A lightweight event to confirm connection and data flow, potentially just sending a timestamp or a small status update.
    -   `bot_status`: Emitted when the bot's running status changes (e.g., started, stopped, error).
-   **Background Task (`background_task`)**: A loop running in a separate thread (started by `socketio.start_background_task`) that periodically calls `get_bot_data()` and emits `data_update` and `data_ping` events to all connected clients via `socketio.emit()`.

### e. Error Handling

-   **Global Error Handler (`@app.errorhandler(Exception)`)**: Catches unhandled exceptions within the Flask application, logs them, and returns a JSON error response (e.g., `{'error': str(e)}`, status code 500).
-   **Graceful Shutdown (`signal_handler`)**: Uses `signal.signal` to catch system signals like `SIGINT` (Ctrl+C) and `SIGTERM` to ensure the bot and Flask app shut down gracefully (e.g., stopping the bot via `stop_bot()`, saving data).

This initial population should provide a good foundation for the `BACKEND_FUNCTIONALITY.md` document.
