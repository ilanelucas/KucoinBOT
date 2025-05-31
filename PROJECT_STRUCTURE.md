# Project Structure

This document outlines the structure of the trading bot project, detailing the organization of directories and files, and explaining the interaction between different components.

## Main Directories

The project is organized into the following main directories:

- **`backend`**: Contains all the server-side logic for the trading bot, including the Flask application.
- **`frontend`**: Contains the user interface components (HTML, CSS, JavaScript).
- **`.vscode`**: Contains Visual Studio Code editor-specific settings and configurations.

## Directory and File Breakdown

### `backend` Directory

The `backend` directory houses the core trading logic and the Flask web server.

- **`app.py`**: The main Flask application file. It handles routing, serves web pages (from `frontend/templates`), and acts as an intermediary between the user interface and the core bot logic.
- **`botV0.py`**: This is the main script for the trading bot. It contains the primary logic for connecting to exchanges (using `ccxt`), executing trades, managing strategies, and handling data. API keys and configuration are likely managed using `dotenv` and `os.getenv()` within this file, rather than a separate `config.json`.
- **`run.py`**: An older script for running the bot. According to its content, it is now obsolete and functionality has been moved to `run.py` in the root directory.

*Note: Previous mentions of `backend/key.py`, `backend/stop_loss.py`, `backend/trading_operations.py`, `backend/utils.py`, `backend/historique_performance.json`, and `backend/journal_trades.csv` have been removed as these files were not found in this directory or are correctly listed under "Root Level Supporting Files". Their functionalities are likely integrated within `backend/botV0.py` and/or `backend/app.py`.*

### `frontend` Directory

The `frontend` directory is responsible for the user interface assets.

- **`static/`**: This directory contains static assets used by the web interface.
    - **`css/style.css`**: Contains the stylesheets for the visual appearance of the web pages.
    - **`js/main.js`**: Contains JavaScript code for client-side interactivity and dynamic content updates (e.g., fetching data from `backend/app.py` and updating the UI).
- **`templates/`**: This directory holds HTML templates used by Flask (via `backend/app.py`) to generate web pages.
    - **`index.html`**: The main HTML page for the user interface, likely displaying trading information, controls, and performance data.

*Note: Previous mention of `frontend/templates/login.html` has been removed as this file was not found.*

### `.vscode` Directory

This directory is used by the Visual Studio Code editor.

- **`settings.json`**: Contains user and workspace settings for VS Code, such as formatting preferences, linter configurations, etc.

## Frontend-Backend Interaction

The frontend and backend interact in the following manner:

1.  **User Interface (Frontend: HTML/CSS/JS)**:
    *   The user interacts with the web interface (`frontend/templates/index.html`).
    *   This interface is rendered by the Flask application (`backend/app.py`).
    *   Client-side JavaScript (`frontend/static/js/main.js`) handles dynamic interactions, making asynchronous requests (e.g., using Fetch API) to specific API endpoints defined in `backend/app.py`. These requests can be for actions like initiating trades, fetching updated data, or changing settings.

2.  **Web Server (Backend: Flask - `backend/app.py`)**:
    *   `backend/app.py` receives HTTP requests from the frontend.
    *   It processes these requests, which may involve calling functions or accessing data from the core trading bot logic in `backend/botV0.py`.
    *   It sends responses back to the frontend, often in JSON format, which JavaScript then uses to update the `index.html` page dynamically.

3.  **Trading Logic (Backend: Python - `backend/botV0.py`)**:
    *   `backend/botV0.py` contains the core trading algorithms, exchange communication (via `ccxt`), risk management, and data handling.
    *   It executes trading operations based on instructions from `backend/app.py` (which are triggered by frontend user actions).
    *   It logs trade activity and performance data, potentially to files in the root directory like `journal_trades.csv` and `historique_performance.json`.

## Root Level Supporting Files

The root directory contains several important files:

- **`.gitignore`**: Specifies intentionally untracked files that Git should ignore.
- **`README.md`**: Provides general information about the project, setup, and usage.
- **`historique_performance.json`**: Stores historical performance data of the bot.
- **`journal_trades.csv`**: A CSV file logging all trades made by the bot.
- **`rapport_quotidien.json`**: Likely stores daily reports or summaries of bot activity.
- **`run.py`**: The main entry point script to launch the trading bot application (likely starting the Flask server in `backend/app.py` and potentially initializing `backend/botV0.py`).

*Note: Previous mentions of `Procfile`, `requirements.txt`, `setup.sh`, `trade_log.csv`, and `trades.db` have been removed as these files were not found in the root directory.*

This structure aims for a clear separation of concerns: the `frontend` for presentation, `backend/app.py` for request handling and serving content, and `backend/botV0.py` for the core trading intelligence. Data persistence seems to be handled by JSON and CSV files primarily in the root directory.
