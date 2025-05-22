import os
import json
import time
import threading
from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_socketio import SocketIO
import logging
from datetime import datetime
import signal
import sys
import hashlib
import werkzeug
import traceback

# Ajuster pour les chemins relatifs
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(current_dir)  # Pour importer botV0.py qui est dans le même dossier

# Import the bot class
from botV0 import BotScalpingAvance

# Configure logging
log_dir = os.path.join(current_dir, 'logs')
if not os.path.exists(log_dir):
    os.makedirs(log_dir)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(log_dir, f"web_interface_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize Flask app with updated template and static folders
app = Flask(__name__, 
            template_folder=os.path.join(parent_dir, 'frontend', 'templates'),
            static_folder=os.path.join(parent_dir, 'frontend', 'static'))
app.config['SECRET_KEY'] = 'kucoin_trading_bot_secret'
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variables
bot_instance = None
bot_thread = None
bot_running = False
last_update_time = 0
update_interval = 2  # seconds
data_cache = {}  # Cache pour stocker les données
cache_hash = ""  # Hash pour vérifier les modifications

# Function to start the bot in a separate thread
def start_bot_thread():
    global bot_instance, bot_thread, bot_running
    
    if bot_running:
        return {"status": "error", "message": "Bot is already running"}
    
    try:
        # Initialize the bot
        bot_instance = BotScalpingAvance()
        
        # Start the bot in a separate thread
        bot_thread = threading.Thread(target=bot_instance.run, args=(True,))  # Pass True to indicate it's running in a thread
        bot_thread.daemon = True
        bot_thread.start()
        
        bot_running = True
        logger.info("Bot started successfully")
        return {"status": "success", "message": "Bot started successfully"}
    except Exception as e:
        logger.error(f"Error starting bot: {e}")
        return {"status": "error", "message": f"Error starting bot: {e}"}

# Function to stop the bot
def stop_bot():
    global bot_instance, bot_thread, bot_running
    
    if not bot_running:
        return {"status": "error", "message": "Bot is not running"}
    
    try:
        # Signal the bot to stop
        if bot_instance:
            bot_instance.running = False
            
            # Fermer proprement les connexions aux API si elles existent
            if hasattr(bot_instance, 'exchange') and bot_instance.exchange:
                try:
                    if hasattr(bot_instance.exchange, 'close'):
                        bot_instance.exchange.close()
                except Exception as e:
                    logger.warning(f"Error closing exchange connection: {e}")
            
            # Annuler tous les ordres en cours si nécessaire
            if hasattr(bot_instance, 'positions') and bot_instance.positions:
                try:
                    # Logique pour fermer les positions ou annuler les ordres si nécessaire
                    logger.info("Cleaning up remaining positions and orders...")
                except Exception as e:
                    logger.warning(f"Error cleaning up positions: {e}")
                    
        # Wait for the thread to terminate
        if bot_thread:
            bot_thread.join(timeout=5)
        
        # Marquer le bot comme arrêté avant de réinitialiser l'instance
        bot_running = False
        
        # Réinitialiser l'instance et le thread
        bot_instance = None
        bot_thread = None
        
        logger.info("Bot stopped successfully")
        return {"status": "success", "message": "Bot stopped successfully"}
    except Exception as e:
        logger.error(f"Error stopping bot: {e}")
        # Même en cas d'erreur, on marque le bot comme arrêté
        bot_running = False
        bot_instance = None
        bot_thread = None
        return {"status": "error", "message": f"Error stopping bot: {e}"}

# Function to get bot data for the UI
def get_bot_data():
    global bot_instance, last_update_time, data_cache, cache_hash
    
    # Only update data every update_interval seconds to avoid excessive load
    current_time = time.time()
    if current_time - last_update_time < update_interval and last_update_time > 0:
        return None
    
    last_update_time = current_time
    
    if not bot_instance or not bot_running:
        return {
            "status": "stopped",
            "balance": 0,
            "positions": [],
            "market_trends": [],
            "performance": {
                "win_rate": 0,
                "total_profit": 0,
                "roi": 0,
                "drawdown": 0
            },
            "recent_trades": [],
            "timestamp": int(current_time * 1000)
        }
    
    try:
        # Get the latest data from the bot
        positions_data = []
        for symbol, position in bot_instance.positions.items():
            # Get current price for each position
            current_price = None
            try:
                # Vérifier que le bot est toujours en cours d'exécution
                if not bot_instance or not bot_running or not hasattr(bot_instance, 'exchange'):
                    continue
                    
                # Try to get the latest price from the exchange
                ticker = bot_instance.exchange.fetch_ticker(symbol)
                current_price = ticker['last'] if 'last' in ticker else None
            except Exception as e:
                logger.error(f"Error fetching current price for {symbol}: {e}")
                
            pos_data = {
                "symbol": symbol,
                "direction": position["direction"],
                "entry_price": position["prix_entree"],
                "current_price": current_price,
                "leverage": position["levier"],
                "quantity": position["quantite"],
                "entry_time": position["heure_entree"],
                "stop_loss": position.get("stop_loss", None),
                "take_profit": position.get("take_profit", None)
            }
            positions_data.append(pos_data)
            
        # Get market trends data
        market_trends = []
        # Vérifier que le bot est toujours en cours d'exécution et a l'attribut tendances_marche
        if bot_instance and bot_running and hasattr(bot_instance, 'tendances_marche'):
            for symbol, trend in bot_instance.tendances_marche.items():
                if isinstance(trend, dict) and "alignement_tendance" in trend:
                    trend_data = {
                        "symbol": symbol,
                        "alignment": trend.get("alignement_tendance", 0),
                        "trend_1m": trend.get("tendance_1m", "unknown"),
                        "trend_5m": trend.get("tendance_5m", "unknown"),
                        "trend_15m": trend.get("tendance_15m", "unknown"),
                        "trend_1h": trend.get("tendance_1h", "unknown"),
                        "volatility": trend.get("volatilite_court", 0),
                        "signal_strength": trend.get("force_signal", 0)
                    }
                    market_trends.append(trend_data)
        
        # Get performance data
        history = bot_instance.historique_performance if hasattr(bot_instance, 'historique_performance') else {}
        
        # Get recent trades (last 10)
        recent_trades = []
        if history and "trades" in history:
            for trade in history["trades"][-10:]:
                trade_data = {
                    "symbol": trade.get("symbole", ""),
                    "action": trade.get("action", ""),
                    "entry_price": trade.get("prix_entree", 0),
                    "exit_price": trade.get("prix_sortie", 0),
                    "profit": trade.get("profit_net", 0),
                    "profit_percent": trade.get("profit_pct", 0),
                    "entry_time": trade.get("date_entree", ""),
                    "exit_time": trade.get("date_sortie", ""),
                    "duration": trade.get("duree_minutes", 0)
                }
                recent_trades.append(trade_data)
        
        # Compile all data
        data = {
            "status": "running" if bot_running else "stopped",
            "balance": getattr(bot_instance, 'balance', 0),
            "initial_balance": getattr(bot_instance, 'balance_initiale', 0),
            "positions": positions_data,
            "market_trends": market_trends,
            "performance": {
                "win_rate": history.get("taux_reussite", 0),
                "total_profit": history.get("profit_total", 0),
                "roi": history.get("roi", 0),
                "drawdown": history.get("drawdown_max", 0),
                "winning_streak": history.get("series_gagnantes", {}).get("max", 0),
                "losing_streak": history.get("series_perdantes", {}).get("max", 0),
                "total_trades": history.get("nombre_trades", {}).get("total", 0),
                "winning_trades": history.get("nombre_trades", {}).get("gagnants", 0),
                "losing_trades": history.get("nombre_trades", {}).get("perdants", 0),
                "sharpe_ratio": history.get("sharpe_ratio", 0)
            },
            "recent_trades": recent_trades,
            "timestamp": int(current_time * 1000)  # Ajouter un timestamp pour vérification côté client
        }
        
        # Calculer un hash du jeu de données pour vérifier les changements
        new_hash = hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest()
        
        # Vérifier si les données ont changé
        if new_hash == cache_hash:
            # Retourner un indicateur que les données n'ont pas changé
            return {"unchanged": True, "timestamp": int(current_time * 1000)}
        
        # Mettre à jour le cache et le hash
        data_cache = data
        cache_hash = new_hash
        
        return data
    except Exception as e:
        logger.error(f"Error getting bot data: {e}")
        return {
            "status": "error",
            "message": f"Error getting bot data: {e}",
            "timestamp": int(current_time * 1000)
        }

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/favicon.ico')
def favicon():
    return app.send_static_file('img/logo.svg')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/api/start', methods=['POST'])
def start_bot_api():
    result = start_bot_thread()
    return jsonify(result)

@app.route('/api/stop', methods=['POST'])
def stop_bot_api():
    result = stop_bot()
    return jsonify(result)

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({"running": bot_running})

@app.route('/api/data', methods=['GET'])
def get_data():
    data = get_bot_data()
    return jsonify(data)

@app.route('/api/close_position', methods=['POST'])
def close_position():
    global bot_instance, bot_running
    
    if not bot_running or not bot_instance:
        return jsonify({"status": "error", "message": "Bot is not running"})
    
    try:
        data = request.json
        symbol = data.get('symbol')
        
        if not symbol:
            return jsonify({"status": "error", "message": "Symbol is required"})
        
        # Vérifier si l'attribut positions existe
        if not hasattr(bot_instance, 'positions'):
            return jsonify({"status": "error", "message": "Bot positions not available"})
            
        # Check if the position exists
        if symbol not in bot_instance.positions:
            return jsonify({"status": "error", "message": f"No active position for {symbol}"})
        
        # Vérifier si l'attribut executer_trade existe
        if not hasattr(bot_instance, 'executer_trade'):
            return jsonify({"status": "error", "message": "Bot trading function not available"})
        
        # Close the position
        position = bot_instance.positions[symbol]
        result = bot_instance.executer_trade(
            symbol,
            "CLOSE_LONG" if position["direction"] == "LONG" else "CLOSE_SHORT",
            None,  # Let the bot fetch the current price
            position["levier"]
        )
        
        if result and "status" in result and result["status"] == "success":
            return jsonify({"status": "success", "message": f"Successfully closed position for {symbol}"})
        else:
            error_msg = result.get('message', 'Unknown error') if result else "No result from trade execution"
            return jsonify({"status": "error", "message": f"Failed to close position: {error_msg}"})
    
    except Exception as e:
        logger.error(f"Error closing position: {e}")
        return jsonify({"status": "error", "message": f"Error closing position: {e}"})

# Socket.IO events
@socketio.on('connect')
def handle_connect():
    logger.info(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    logger.info(f"Client disconnected: {request.sid}")

# Background task to emit data updates
def background_task():
    global bot_running
    last_error_time = 0
    error_cooldown = 5  # Temps minimum entre les logs d'erreurs (secondes)
    
    while True:
        try:
            # Si le bot n'est pas en cours d'exécution, envoyez moins fréquemment des mises à jour
            if not bot_running:
                socketio.emit('bot_status', {"status": "stopped", "timestamp": int(time.time() * 1000)})
                socketio.sleep(3)  # Attendre plus longtemps si le bot est arrêté
                continue
                
            # Récupérer les données du bot
            data = get_bot_data()
            
            if data:
                # Si les données sont inchangées, envoyez seulement un ping
                if data.get("unchanged", False):
                    socketio.emit('data_ping', {"timestamp": data.get("timestamp")})
                else:
                    socketio.emit('data_update', data)
        except Exception as e:
            # Éviter de spammer les logs avec la même erreur
            current_time = time.time()
            if current_time - last_error_time > error_cooldown:
                logger.error(f"Error in background task: {e}")
                last_error_time = current_time
                
        # Attente avant la prochaine mise à jour
        socketio.sleep(1)

# Start the background task when the app starts
@socketio.on('start_background_task')
def start_background_task():
    socketio.start_background_task(background_task)

# Nouvelle route pour obtenir l'état du bot et les performances système
@app.route('/api/system_status', methods=['GET'])
def get_system_status():
    global bot_instance, bot_running
    
    # Données par défaut si le bot n'est pas en cours d'exécution
    status_data = {
        "bot_status": "stopped",
        "uptime": 0,
        "cpu_usage": 0,
        "memory_usage": 0,
        "positions_count": 0,
        "timestamp": int(time.time() * 1000)
    }
    
    if not bot_instance or not bot_running:
        return jsonify(status_data)
    
    try:
        import psutil
        process = psutil.Process(os.getpid())
        
        # Calculer le temps d'exécution
        uptime = time.time() - process.create_time()
        
        # Compter les positions en vérifiant d'abord si l'attribut existe
        positions_count = 0
        if hasattr(bot_instance, 'positions'):
            positions_count = len(bot_instance.positions)
        
        status_data.update({
            "bot_status": "running",
            "uptime": uptime,
            "cpu_usage": process.cpu_percent(),
            "memory_usage": process.memory_info().rss / 1024 / 1024,  # En MB
            "positions_count": positions_count
        })
        
        return jsonify(status_data)
    except ImportError:
        # psutil n'est pas installé
        status_data.update({
            "bot_status": "running",
            "positions_count": len(bot_instance.positions) if hasattr(bot_instance, 'positions') else 0
        })
        return jsonify(status_data)
    except Exception as e:
        logger.error(f"Error getting system status: {e}")
        return jsonify({
            "status": "error", 
            "message": str(e),
            "timestamp": int(time.time() * 1000)
        })

# Gestionnaire d'erreurs global pour Flask
@app.errorhandler(Exception)
def handle_exception(e):
    logger.error(f"Unhandled exception: {str(e)}")
    
    # Si c'est une erreur HTTP standard, la renvoyer telle quelle
    if isinstance(e, werkzeug.exceptions.HTTPException):
        return e
        
    # Pour les autres erreurs, renvoyer une réponse 500
    response = {
        "status": "error",
        "message": "Internal server error",
        "timestamp": int(time.time() * 1000)
    }
    
    # En mode développement, inclure plus de détails
    if app.debug:
        response["details"] = str(e)
        response["traceback"] = traceback.format_exc()
    
    return jsonify(response), 500

# Gracefully handle shutdown
def signal_handler(sig, frame):
    logger.info("Shutting down...")
    if bot_running:
        stop_bot()
    sys.exit(0)

# Register signal handlers
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

if __name__ == '__main__':
    # Start the Socket.IO background task
    socketio.start_background_task(background_task)
    
    # Run the Flask app
    logger.info("Starting web interface")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True) 