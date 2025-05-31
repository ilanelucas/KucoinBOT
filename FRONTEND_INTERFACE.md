# Frontend Interface

## 1. Overview

The frontend provides a web-based user interface for monitoring and interacting with the KuCoin trading bot. It allows users to view real-time data, track performance, manage bot operations, and see market information.

**Technologies Used:**
-   **Flask (Python)**: Serves the HTML pages and provides API endpoints for communication.
-   **HTML (`index.html`)**: Defines the structure and content of the web page.
-   **CSS (`styles.css`)**: Handles the styling and visual appearance, implementing a dark theme.
-   **JavaScript (`main.js`)**: Manages interactivity, DOM manipulation, data fetching, and real-time updates.
-   **Socket.IO**: Enables bidirectional, real-time communication between the frontend and the Flask backend for instant data updates and status changes.
-   **Chart.js**: Used for rendering dynamic charts to visualize performance and balance history.

## 2. Main Page Structure (`index.html`)

### Layout

The overall layout is a single-page application design:
-   A fixed **sidebar** on the left for navigation and bot control.
-   A **top bar** displaying key performance indicators and user controls.
-   A **main content area** that dynamically displays different sections based on sidebar navigation.

### Sidebar (`<nav class="sidebar">`)

-   **Logo and Application Title**: Displays "KuCoin Bot" prominently.
-   **Navigation Menu**:
    -   Dashboard
    -   Portfolio
    -   Market
    -   Trades
    -   Settings
-   **Bot Status**:
    -   Visual indicator (`id="statusIndicator"`): Changes color based on bot state (e.g., green for running, red for stopped).
    -   Text display (`id="botStatusText"`): Shows "Running", "Stopped", "Connecting...", etc.
-   **Bot Controls**:
    -   Start Bot button (`id="startBot"`)
    -   Stop Bot button (`id="stopBot"`)

### Top Bar (`<div class="top-bar">`)

-   **Balance Display**: Shows the current account balance (`id="balanceValue"`).
-   **Key Performance Metrics**:
    -   ROI (`id="roiValue"`)
    -   Win Rate (`id="winRateValue"`)
    -   Total Profit (`id="profitValue"`)
-   **User Controls**:
    -   Refresh button (icon): Manually triggers a data refresh.
    -   Theme toggle: Switches between dark and light themes.

### Main Content Area (`<main class="main-content">`)

This area dynamically loads content for different sections:
-   **Dashboard (`id="dashboard"`)**: Default view, showing an overview of bot performance and active trades.
-   **Portfolio (`id="portfolio"`)**: Detailed view of historical performance, balance changes, and overall position summaries.
-   **Market (`id="market"`)**: Displays market analysis, trend information, and potential trading signals.
-   **Trades (`id="trades"`)**: Comprehensive log of all historical trades with filtering capabilities.
-   **Settings (`id="settings"`)**: Configuration options for the bot (mostly display-only for security) and UI preferences.

## 3. Key UI Sections and Features

### a. Dashboard (`id="dashboard"`)

-   **Portfolio Summary Card**:
    -   Displays: Initial Balance, Current Balance, Total P/L, Active Positions count.
    -   Includes a line chart (`id="balanceChart"`) visualizing balance progression.
-   **Trading Performance Card**:
    -   Shows detailed metrics: Win Rate, Total Trades, Winning Trades, Losing Trades, Longest Winning Streak, Longest Losing Streak, Sharpe Ratio, Max Drawdown.
-   **Active Positions Card/Table (`id="activePositionsTable"`)**:
    -   Lists currently open trades.
    -   Columns: Symbol, Direction (Long/Short), Entry Price, Current Price, P&L (%), Leverage, Stop Loss, Take Profit, Entry Time.
    -   Includes a "Close" button for each position to allow manual closure.
-   **Recent Trades Card/Table (`id="recentTradesTable"`)**:
    -   Shows a summary of the most recently closed trades with key details.

### b. Portfolio (`id="portfolio"`)

-   **Balance History Chart (`id="portfolioHistoryChart"`)**:
    -   A more detailed chart, potentially with zoom/pan, showing balance changes over a selected period.
-   **Performance Metrics Card**:
    -   Displays: Overall ROI, Daily P&L, Cumulative Fees Paid, Best Trade (PnL), Worst Trade (PnL), Average Trade Duration.
-   **All Positions Table (`id="allPositionsTable"`)**:
    -   The `index.html` file defines a table structure with this ID under the "Portfolio" section.
    -   However, the current `main.js` primarily focuses on updating the `activePositionsTable` on the Dashboard with live position data.
    -   It is not explicitly clear from `main.js` if `allPositionsTable` is actively populated. Its intended purpose could be to display a more comprehensive list, such as a mix of open and recently closed positions, or all historical positions, potentially with different columns or filtering than the active positions table. Further backend data and JavaScript logic would be needed to fully populate this table as distinct from `activePositionsTable` or `tradeHistoryTable`.

### c. Market (`id="market"`)

-   **Market Trends Table (`id="marketTrendsTable"`)**:
    -   Displays trend analysis for monitored trading pairs.
    -   Columns: Pair, Trend (1m), Trend (5m), Trend (15m), Trend (1h), Trend Alignment (e.g., "Strong Up"), Volatility (e.g., ATR value or percentage), Signal Strength (score).
-   **Trading Signals Table (`id="tradingSignalsTable"`)**:
    -   The `index.html` file includes a table element with this ID, intended to show specific trading signals generated by the bot.
    -   However, the provided `main.js` code does not contain explicit logic to populate this `tradingSignalsTable`. It appears to be a UI element available for future implementation or for a part of the `bot_data.pair_analysis` that is not currently being iterated over to fill this specific table.

### d. Trades (`id="trades"`)

-   **Trade History Table (`id="tradeHistoryTable"`)**:
    -   A comprehensive, filterable, and sortable log of all past trades.
    -   Filters: By symbol, date range.
    -   Columns: Symbol, Direction, Entry Price, Exit Price, Quantity, P&L, Fees, Entry Time, Exit Time, Duration.
-   **Trade Statistics Card**:
    -   Displays summary statistics for the trades currently visible in the filtered `tradeHistoryTable` (e.g., Total Trades in view, Win Rate for filtered trades, Total Profit for filtered trades).

### e. Settings (`id="settings"`)

-   **Bot Configuration Card (API Keys)**:
    -   Displays fields for API Key, Secret Key, and Passphrase. These are likely disabled or masked for security reasons, primarily for informational display.
-   **Trading Parameters Card**:
    -   Shows current bot settings: Risk Per Trade (%), Base Leverage, Max Leverage, Max Concurrent Positions. These are also likely display-only.
-   **Trading Pairs Card (`id="tradingPairsGrid"`)**:
    -   Displays the list of trading pairs the bot is currently monitoring (e.g., BTC/USDT, ETH/USDT).
-   **Interface Settings Card**:
    -   Options for:
        -   Theme selection (Dark/Light).
        -   Data refresh rate for UI elements (if not solely reliant on Socket.IO pushes).
        -   Notification preferences (e.g., enable/disable trade alerts).

## 4. Styling and Appearance (`styles.css`)

-   **Overall Theme**: A dark theme is the default, providing a modern and professional look suitable for financial applications. A light theme toggle is also provided.
-   **Color Palette**:
    -   Primary colors: Dark grays and blues for backgrounds and containers.
    -   Accent colors: Blues or cyans for interactive elements and highlights.
    -   Success color: Green (e.g., for positive P&L, bot running status).
    -   Danger color: Red (e.g., for negative P&L, bot stopped status, errors).
-   **Typography**: Uses the "Poppins" font family, known for its clean and geometric appearance.
-   **Layout**:
    -   Card-based design: Information is organized into distinct cards with rounded corners and subtle shadows.
    -   Flexbox and Grid: Likely used for structuring main layout components and aligning items within cards.
-   **Responsive Design**: Media queries and flexible units (percentages, `vw`/`vh`, `rem`/`em`) are used to ensure the interface adapts to different screen sizes, making it usable on desktops, tablets, and potentially mobile devices.

## 5. Interactivity and Real-time Updates (`main.js`)

-   **Socket.IO Integration**:
    -   Establishes a connection to the backend Socket.IO server (`io()`).
    -   Handles `connect`, `disconnect`, `connect_error` events.
    -   Listens for custom events:
        -   `data_update`: Receives comprehensive bot data and triggers UI updates.
        -   `data_ping`: Used for keep-alive or minimal status checks.
        -   `bot_status`: Receives updates on the bot's operational state (running, stopped, error) and updates the status indicator and text.
-   **DOM Updates**:
    -   JavaScript in `main.js` uses specific functions (e.g., `updateUI`, `updatePositionsTable`, `updateRecentTradesTable`, `updateMarketTrendsTable`) to take data from backend events (primarily `data_update`) and populate or modify the relevant HTML elements (text content, table rows, chart data).
    -   Efficiently updates only necessary parts of the DOM to maintain performance.
-   **Chart.js Usage**:
    -   Initializes `balanceChart` (on the dashboard) and `portfolioHistoryChart` (on the portfolio page) as line charts.
    -   The `updateBalanceChart` function updates the chart datasets and labels with new data received from the backend, then calls `chart.update()`.
-   **Event Handling**:
    -   **Start/Stop Buttons**: Click events on `#startBot` and `#stopBot` trigger `fetch` requests to `/api/start` and `/api/stop` respectively. UI is updated optimistically or based on `bot_status` events.
    -   **Manual Position Closing**: Event listeners on "Close" buttons in the active positions table capture the symbol and send a POST request to `/api/close_position`.
    -   **Theme Toggling**: A button click toggles a class on the `body` (e.g., `dark-theme`, `light-theme`) and saves the preference to `localStorage`.
    -   **Navigation**: Clicking sidebar links changes the visibility of main content sections (e.g., shows `#dashboard`, hides others).
    -   **Data Refresh Button**: Clicking the refresh button icon calls the `refreshData()` function, which in turn makes a `fetch` GET request to the `/api/data` endpoint to get the latest bot data.
    -   **Filtering (Trades Page)**: Input event listeners on filter fields (symbol, date) trigger a function to filter and re-render the `tradeHistoryTable`.
-   **Toast Notifications**: Uses a library or custom implementation to display non-intrusive notifications for events like bot started/stopped, position closed, errors, etc.
-   **Error Handling/Connection Issues**:
    -   Displays messages or changes status indicators if Socket.IO disconnects.
    -   May implement reconnection logic for Socket.IO.
    -   `fetch` requests include `.catch()` blocks to handle API errors and display them to the user.

This provides a comprehensive overview of the frontend interface.
