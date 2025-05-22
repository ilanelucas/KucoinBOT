import ccxt
import pandas as pd
import numpy as np
import time
import socket
import logging
import sys
import signal
import json
import os
from datetime import datetime, timedelta
from threading import Lock, Thread
from retry import retry
from collections import deque
from dotenv import load_dotenv

# Charger les variables d'environnement depuis le fichier .env
load_dotenv()

# Configuration du répertoire de logs
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, f"trading_bot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")

# Configuration du logging avec deux handlers différents
# Un pour le fichier (détaillé) et un pour la console (simplifié)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Handler pour le fichier (logs détaillés)
file_handler = logging.FileHandler(log_file, encoding='utf-8')
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

# Handler pour la console (logs simplifiés)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(logging.Formatter('%(asctime)s - %(message)s'))
logger.addHandler(console_handler)

# Configuration de l'API KuCoin Futures
api_key = os.getenv("KUCOIN_API_KEY")
api_secret = os.getenv("KUCOIN_API_SECRET")
api_passphrase = os.getenv("KUCOIN_API_PASSPHRASE")

# Vérifier que les variables d'environnement sont chargées
if not api_key or not api_secret or not api_passphrase:
    logger.error("Erreur: Les clés API KuCoin n'ont pas été trouvées dans le fichier .env")
    sys.exit(1)

# Paramètres du bot
INITIAL_BALANCE = 400
BASE_LEVERAGE = 15  # Augmenté pour plus d'agressivité
MAX_LEVERAGE = 30   # Augmenté pour plus d'agressivité
RISK_PER_TRADE = 0.30  # Augmenté pour des positions plus importantes
MAX_POSITIONS = 10  # Augmenté pour plus d'opportunités
PAIRS = [
    'BTC/USDT:USDT', 'ETH/USDT:USDT', 'BNB/USDT:USDT', 'SOL/USDT:USDT',
    'XRP/USDT:USDT', 'TAO/USDT:USDT', 'LINK/USDT:USDT', 'DOGE/USDT:USDT',
    'AVAX/USDT:USDT', 'MATIC/USDT:USDT', 'DOT/USDT:USDT', 'ADA/USDT:USDT',
    'NEAR/USDT:USDT', 'ARB/USDT:USDT', 'OP/USDT:USDT', 'ATOM/USDT:USDT'
]

# Frais de trading
TAKER_FEE = 0.0006  # 0.06% par défaut
MAKER_FEE = 0.0002  # 0.02% par défaut

# Fichiers de suivi des performances
PERFORMANCE_FILE = "historique_performance.json"
DAILY_REPORT_FILE = "rapport_quotidien.json"
TRADES_LOG_FILE = "journal_trades.csv"

class BotScalpingAvance:
    def __init__(self):
        self.exchange = self._initialiser_exchange()
        self.balance = INITIAL_BALANCE
        self.balance_initiale = INITIAL_BALANCE
        self.positions = {}
        self.running = True
        self.lock = Lock()
        self.scores_volatilite = {}
        self.cache_donnees = {}
        self.historique_performance = self._charger_historique_performance()
        self.historique_trades = []
        self.tendances_marche = {}
        self.file_positions = deque()
        self.derniere_analyse = {}
        self.frais_cumules = 0
        self.derniere_sauvegarde = time.time()
        self.trades_gagnants_consecutifs = 0
        self.trades_perdants_consecutifs = 0
        
        # Initialiser le journal des trades CSV s'il n'existe pas
        if not os.path.exists(TRADES_LOG_FILE):
            with open(TRADES_LOG_FILE, 'w', encoding='utf-8') as f:
                f.write("Date,Symbole,Direction,Prix Entrée,Prix Sortie,Quantité,Levier,Profit Net,Profit %,Frais,Durée (min)\n")
        
        # Log simple pour l'initialisation
        print(f"Bot initialisé | Solde: {self.balance} USDT | Mode: Scalping Haute Fréquence")
        
        # Vérification de la connexion et analyse des paires
        self.verifier_connexion()
        self.paires = self.analyser_paires()
        self.ajustements_levier = {paire: BASE_LEVERAGE for paire in self.paires}
        print(f"Paires sélectionnées: {', '.join(self.paires[:5])}... ({len(self.paires)} au total)")
        
        # Démarrage des tâches en arrière-plan
        self.demarrer_taches_arriere_plan()

    def _initialiser_exchange(self):
        """Initialise la connexion à l'exchange avec les paramètres optimaux"""
        exchange = ccxt.kucoinfutures({
            'apiKey': api_key,
            'secret': api_secret,
            'password': api_passphrase,
            'enableRateLimit': True,
            'timeout': 10000,
            'options': {
                'defaultType': 'future',
                'adjustForTimeDifference': True,
                'recvWindow': 60000
            }
        })
        return exchange

    def _charger_historique_performance(self):
        """Charge l'historique des performances depuis le fichier JSON"""
        try:
            if os.path.exists(PERFORMANCE_FILE):
                with open(PERFORMANCE_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return {
                "trades": [], 
                "pnl_quotidien": {}, 
                "taux_reussite": 0, 
                "profit_total": 0,
                "frais_total": 0,
                "meilleur_trade": {"symbole": "", "profit": 0},
                "pire_trade": {"symbole": "", "profit": 0},
                "nombre_trades": {"total": 0, "gagnants": 0, "perdants": 0},
                "series_gagnantes": {"max": 0, "actuelle": 0},
                "series_perdantes": {"max": 0, "actuelle": 0},
                "roi": 0,
                "sharpe_ratio": 0,
                "drawdown_max": 0
            }
        except Exception as e:
            logger.error(f"Erreur lors du chargement de l'historique de performance: {e}")
            return {
                "trades": [], 
                "pnl_quotidien": {}, 
                "taux_reussite": 0, 
                "profit_total": 0,
                "frais_total": 0,
                "meilleur_trade": {"symbole": "", "profit": 0},
                "pire_trade": {"symbole": "", "profit": 0},
                "nombre_trades": {"total": 0, "gagnants": 0, "perdants": 0},
                "series_gagnantes": {"max": 0, "actuelle": 0},
                "series_perdantes": {"max": 0, "actuelle": 0},
                "roi": 0,
                "sharpe_ratio": 0,
                "drawdown_max": 0
            }

    def _sauvegarder_historique_performance(self):
        """Sauvegarde l'historique des performances dans un fichier JSON"""
        try:
            # Calculer des métriques supplémentaires
            self.historique_performance["roi"] = ((self.balance / self.balance_initiale) - 1) * 100
            
            # Calculer le Sharpe Ratio si nous avons assez de données
            if len(self.historique_performance["trades"]) > 10:
                profits = [t.get("profit_net", 0) for t in self.historique_performance["trades"][-30:]]
                if profits:
                    rendement_moyen = np.mean(profits)
                    volatilite = np.std(profits) if np.std(profits) > 0 else 0.0001
                    self.historique_performance["sharpe_ratio"] = (rendement_moyen / volatilite) if volatilite else 0
            
            # Calculer le drawdown maximum
            if len(self.historique_performance["trades"]) > 0:
                solde_cumule = self.balance_initiale
                solde_max = solde_cumule
                drawdown_max = 0
                
                for trade in self.historique_performance["trades"]:
                    solde_cumule += trade.get("profit_net", 0)
                    solde_max = max(solde_max, solde_cumule)
                    drawdown_actuel = (solde_max - solde_cumule) / solde_max * 100 if solde_max > 0 else 0
                    drawdown_max = max(drawdown_max, drawdown_actuel)
                
                self.historique_performance["drawdown_max"] = drawdown_max
            
            with open(PERFORMANCE_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.historique_performance, f, indent=4, ensure_ascii=False)
                
            # Générer un rapport quotidien
            aujourd_hui = datetime.now().strftime('%Y-%m-%d')
            rapport = {
                "date": aujourd_hui,
                "solde": self.balance,
                "profit_jour": self.historique_performance["pnl_quotidien"].get(aujourd_hui, 0),
                "nombre_trades_jour": sum(1 for t in self.historique_performance["trades"] 
                                         if t.get("date_sortie", "").startswith(aujourd_hui)),
                "taux_reussite": self.historique_performance["taux_reussite"],
                "profit_total": self.historique_performance["profit_total"],
                "frais_total": self.historique_performance["frais_total"],
                "roi": self.historique_performance["roi"],
                "sharpe_ratio": self.historique_performance["sharpe_ratio"],
                "drawdown_max": self.historique_performance["drawdown_max"],
                "series_gagnantes": self.historique_performance["series_gagnantes"],
                "series_perdantes": self.historique_performance["series_perdantes"],
                "positions_actives": len(self.positions)
            }
            
            with open(DAILY_REPORT_FILE, 'w', encoding='utf-8') as f:
                json.dump(rapport, f, indent=4, ensure_ascii=False)
                
        except Exception as e:
            logger.error(f"Erreur lors de la sauvegarde de l'historique de performance: {e}")

    def verifier_connexion(self):
        """Vérifie la connexion à l'API de l'exchange"""
        try:
            self.exchange.fetch_ticker('BTC/USDT:USDT')
            print("✅ Connexion à l'API KuCoin Futures réussie")
        except Exception as e:
            print(f"❌ Échec de la connexion à l'API: {e}")
            sys.exit(1)

    @retry(tries=3, delay=1, backoff=2)
    def recuperer_ohlcv(self, symbole, timeframe='1m', limite=100):
        """Récupère les données OHLCV avec mise en cache pour optimiser les appels API"""
        try:
            cle_cache = f"{symbole}_{timeframe}_{limite}"
            temps_actuel = time.time()
            
            # Utiliser les données en cache si disponibles et récentes
            if (cle_cache in self.cache_donnees and 
                temps_actuel - self.cache_donnees[cle_cache]['temps'] < 3):
                return self.cache_donnees[cle_cache]['donnees']
            
            ohlcv = self.exchange.fetch_ohlcv(symbole, timeframe, limit=limite)
            if not ohlcv or len(ohlcv) < limite * 0.9:
                return None
                
            df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            
            # Mettre en cache les données
            self.cache_donnees[cle_cache] = {'donnees': df, 'temps': temps_actuel}
            return df
        except Exception as e:
            logger.error(f"Erreur lors de la récupération des données OHLCV pour {symbole}: {e}")
            return None

    def analyser_paires(self):
        """Analyse les paires pour identifier les meilleures opportunités de trading"""
        logger.info("Analyse des paires pour les opportunités de trading...")
        marches = self.exchange.load_markets()
        paires_valides = []
        metriques_paires = {}
        
        for paire in PAIRS:
            try:
                if paire in marches and marches[paire]['active']:
                    # Récupérer les données pour plusieurs timeframes
                    df_1m = self.recuperer_ohlcv(paire, '1m', 100)
                    df_5m = self.recuperer_ohlcv(paire, '5m', 100)
                    df_15m = self.recuperer_ohlcv(paire, '15m', 50)
                    
                    if df_1m is None or df_5m is None or df_15m is None:
                        continue
                    
                    # Calculer les métriques de volatilité
                    vol_1m = df_1m['close'].pct_change().std() * 100
                    vol_5m = df_5m['close'].pct_change().std() * 100
                    vol_15m = df_15m['close'].pct_change().std() * 100
                    
                    # Calculer les métriques de volume
                    augmentation_vol = df_1m['volume'].iloc[-10:].mean() / df_1m['volume'].iloc[-30:-10].mean()
                    
                    # Calculer la force de la tendance
                    variation_prix_24h = ((df_15m['close'].iloc[-1] / df_15m['close'].iloc[0]) - 1) * 100
                    
                                        # Score combiné - favoriser les paires avec une bonne volatilité et volume
                    score = (vol_1m * 0.5) + (vol_5m * 0.2) + (vol_15m * 0.1) + (augmentation_vol * 2) + abs(variation_prix_24h * 0.1)
                    
                    # Stocker les métriques
                    metriques_paires[paire] = {
                        'volatilite_1m': vol_1m,
                        'volatilite_5m': vol_5m,
                        'volatilite_15m': vol_15m,
                        'augmentation_volume': augmentation_vol,
                        'variation_24h': variation_prix_24h,
                        'score': score
                    }
                    
                    self.scores_volatilite[paire] = vol_1m
                    paires_valides.append(paire)
                    
            except Exception as e:
                logger.error(f"Erreur lors de l'analyse de {paire}: {e}")
        
        # Trier les paires par score et prendre les meilleures
        paires_triees = sorted(paires_valides, key=lambda x: metriques_paires.get(x, {}).get('score', 0), reverse=True)
        
        # Détails dans le fichier log, pas dans la console
        logger.info(f"Analyse des paires terminée. Top 5 paires: {paires_triees[:5]}")
        for paire in paires_triees[:10]:
            metrics = metriques_paires[paire]
            logger.info(f"{paire}: Score {metrics['score']:.2f}, Vol 1m {metrics['volatilite_1m']:.2f}%, Vol 5m {metrics['volatilite_5m']:.2f}%, Var 24h {metrics['variation_24h']:.2f}%")
        
        return paires_triees[:MAX_POSITIONS*2] if paires_triees else ['BTC/USDT:USDT', 'ETH/USDT:USDT']

    def calculer_indicateurs(self, df):
        """Calcule les indicateurs techniques pour l'analyse"""
        # EMAs
        df['ema_5'] = df['close'].ewm(span=5, adjust=False).mean()
        df['ema_8'] = df['close'].ewm(span=8, adjust=False).mean()
        df['ema_13'] = df['close'].ewm(span=13, adjust=False).mean()
        df['ema_21'] = df['close'].ewm(span=21, adjust=False).mean()
        df['ema_34'] = df['close'].ewm(span=34, adjust=False).mean()
        df['ema_55'] = df['close'].ewm(span=55, adjust=False).mean()
        
        # Bandes de Bollinger (20, 2)
        df['sma_20'] = df['close'].rolling(window=20).mean()
        df['std_20'] = df['close'].rolling(window=20).std()
        df['bb_upper'] = df['sma_20'] + (df['std_20'] * 2)
        df['bb_lower'] = df['sma_20'] - (df['std_20'] * 2)
        df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / df['sma_20']
        
        # Niveaux de support/résistance
        df['high_max'] = df['high'].rolling(window=10).max()
        df['low_min'] = df['low'].rolling(window=10).min()
        
        # Volume relatif
        df['volume_sma'] = df['volume'].rolling(window=20).mean()
        df['volume_ratio'] = df['volume'] / df['volume_sma']
        
        # RSI
        delta = df['close'].diff()
        gain = delta.where(delta > 0, 0).rolling(window=14).mean()
        perte = -delta.where(delta < 0, 0).rolling(window=14).mean()
        rs = gain / perte
        df['rsi'] = 100 - (100 / (1 + rs))
        
        # MACD
        df['macd'] = df['ema_13'] - df['ema_34']
        df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()
        df['macd_hist'] = df['macd'] - df['macd_signal']
        
        # ATR pour la volatilité
        df['atr'] = self.calculer_atr(df, 14)
        
        # Momentum
        df['momentum'] = df['close'] / df['close'].shift(10) - 1
        
        # Divergences RSI
        df['divergence_haussiere'] = False
        df['divergence_baissiere'] = False
        
        if len(df) > 30:
            for i in range(5, 30):
                if df['low'].iloc[-i] < df['low'].iloc[-i-1] and df['rsi'].iloc[-i] > df['rsi'].iloc[-i-1]:
                    df.loc[df.index[-i], 'divergence_haussiere'] = True
                if df['high'].iloc[-i] > df['high'].iloc[-i-1] and df['rsi'].iloc[-i] < df['rsi'].iloc[-i-1]:
                    df.loc[df.index[-i], 'divergence_baissiere'] = True
        
        # Identification des patterns de chandeliers
        self.identifier_patterns_chandeliers(df)
        
        return df.dropna()

    def calculer_atr(self, df, periode=14):
        """Calcule l'Average True Range (ATR)"""
        high = df['high']
        low = df['low']
        close = df['close'].shift()
        
        tr1 = high - low
        tr2 = abs(high - close)
        tr3 = abs(low - close)
        
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = tr.rolling(window=periode).mean()
        
        return atr

    def identifier_patterns_chandeliers(self, df):
        """Identifie les patterns de chandeliers japonais"""
        if len(df) < 5:
            return df
            
        # Calculer la taille des corps et des ombres
        df['corps'] = abs(df['close'] - df['open'])
        df['ombre_haute'] = df['high'] - df[['open', 'close']].max(axis=1)
        df['ombre_basse'] = df[['open', 'close']].min(axis=1) - df['low']
        df['corps_moyen'] = df['corps'].rolling(window=10).mean()
        
        # Identifier les chandeliers Doji
        df['doji'] = df['corps'] <= 0.1 * df['corps_moyen']
        
        # Identifier les marteaux
        df['marteau'] = (df['ombre_basse'] >= 2 * df['corps']) & (df['ombre_haute'] <= 0.5 * df['corps'])
        
        # Identifier les étoiles filantes
        df['etoile_filante'] = (df['ombre_haute'] >= 2 * df['corps']) & (df['ombre_basse'] <= 0.5 * df['corps'])
        
        # Identifier les chandeliers d'absorption
        df['absorption_haussiere'] = (df['open'].shift(1) > df['close'].shift(1)) & (df['close'] > df['open']) & (df['corps'] > df['corps'].shift(1))
        df['absorption_baissiere'] = (df['close'].shift(1) > df['open'].shift(1)) & (df['open'] > df['close']) & (df['corps'] > df['corps'].shift(1))
        
        return df

    def ajuster_levier_et_niveaux(self, symbole, df):
        """Ajuste dynamiquement le levier et les niveaux de stop-loss/take-profit"""
        # Obtenir les métriques de volatilité
        volatilite = self.scores_volatilite.get(symbole, df['close'].pct_change().std() * 100)
        atr_pct = df['atr'].iloc[-1] / df['close'].iloc[-1] * 100 if 'atr' in df.columns else volatilite
        
        # Déterminer les conditions du marché
        est_range = df['bb_width'].iloc[-1] < df['bb_width'].rolling(window=20).mean().iloc[-1] if 'bb_width' in df.columns else False
        tendance_haussiere = df['ema_8'].iloc[-1] > df['ema_21'].iloc[-1] if 'ema_8' in df.columns else False
        tendance_baissiere = df['ema_8'].iloc[-1] < df['ema_21'].iloc[-1] if 'ema_8' in df.columns else False
        est_tendance = tendance_haussiere or tendance_baissiere
        
        # Ajuster le levier en fonction des conditions du marché et de la volatilité
        levier_base = max(10, min(MAX_LEVERAGE, int(25 - (volatilite * 1.5))))
        
        # Augmenter le levier pour les marchés en tendance forte
        if est_tendance and df['volume_ratio'].iloc[-1] > 1.2:
            levier = min(MAX_LEVERAGE, int(levier_base * 1.3))
        # Réduire le levier pour les marchés en range ou très volatils
        elif est_range or volatilite > 5:
            levier = max(5, int(levier_base * 0.8))
        else:
            levier = levier_base
            
        # Ajuster le stop-loss et le take-profit en fonction de l'ATR
        facteur_atr = min(atr_pct, 3.0)  # Limiter l'influence de l'ATR
        
        # Stratégie plus agressive pour les marchés en tendance
        if est_tendance:
            sl_pct = facteur_atr * 1.0  # Stop-loss plus serré
            tp_pct = facteur_atr * 3.0  # Take-profit plus élevé
        # Stratégie plus conservatrice pour les marchés en range
        elif est_range:
            sl_pct = facteur_atr * 1.5  # Stop-loss plus large
            tp_pct = facteur_atr * 2.0  # Take-profit modéré
        else:
            sl_pct = facteur_atr * 1.2
            tp_pct = facteur_atr * 2.5
            
        # Assurer des valeurs minimales et maximales
        sl_pct = max(0.5, min(4.0, sl_pct))  # Entre 0,5% et 4%
        tp_pct = max(1.0, min(12.0, tp_pct))  # Entre 1% et 12%
        
        # Stocker le levier ajusté
        self.ajustements_levier[symbole] = levier
        
        return levier, sl_pct/100, tp_pct/100

    def verifier_signaux(self, df, symbole):
        """Système avancé de détection de signaux de trading"""
        if len(df) < 30:
            return False, False
            
        derniere_ligne = df.iloc[-1]
        avant_derniere_ligne = df.iloc[-2]
        
        # Analyse de tendance
        tendance_haussiere = derniere_ligne['ema_8'] > derniere_ligne['ema_21'] and derniere_ligne['close'] > derniere_ligne['ema_8']
        tendance_baissiere = derniere_ligne['ema_8'] < derniere_ligne['ema_21'] and derniere_ligne['close'] < derniere_ligne['ema_8']
        
        # Analyse de momentum
        momentum_haussier = derniere_ligne['rsi'] > 50 and derniere_ligne['rsi'] > avant_derniere_ligne['rsi']
        momentum_baissier = derniere_ligne['rsi'] < 50 and derniere_ligne['rsi'] < avant_derniere_ligne['rsi']
        
        # Confirmation par le volume
        volume_eleve = derniere_ligne['volume_ratio'] > 1.2
        
        # Patterns de price action
        breakout_haut = derniere_ligne['close'] > derniere_ligne['high_max'] and volume_eleve
        breakout_bas = derniere_ligne['close'] < derniere_ligne['low_min'] and volume_eleve
        
        # Signaux MACD
        macd_haussier = derniere_ligne['macd'] > derniere_ligne['macd_signal'] and avant_derniere_ligne['macd'] <= avant_derniere_ligne['macd_signal']
        macd_baissier = derniere_ligne['macd'] < derniere_ligne['macd_signal'] and avant_derniere_ligne['macd'] >= avant_derniere_ligne['macd_signal']
        
        # Signaux Bollinger Bands
        bb_compression = derniere_ligne['bb_width'] < df['bb_width'].rolling(window=20).mean().iloc[-1] * 0.8
        bb_expansion = derniere_ligne['bb_width'] > df['bb_width'].rolling(window=20).mean().iloc[-1] * 1.2
        bb_casse_haut = derniere_ligne['close'] > derniere_ligne['bb_upper']
        bb_casse_bas = derniere_ligne['close'] < derniere_ligne['bb_lower']
        
        # Patterns de chandeliers
        pattern_haussier = derniere_ligne.get('marteau', False) or derniere_ligne.get('absorption_haussiere', False)
        pattern_baissier = derniere_ligne.get('etoile_filante', False) or derniere_ligne.get('absorption_baissiere', False)
        
        # Divergences
        divergence_haussiere = df['divergence_haussiere'].iloc[-5:].any()
        divergence_baissiere = df['divergence_baissiere'].iloc[-5:].any()
        
        # Signaux combinés avec notation pondérée
        score_long = 0
        score_short = 0
        
        # Composante de tendance (40%)
        if tendance_haussiere:
            score_long += 4
        if tendance_baissiere:
            score_short += 4
            
        # Composante de momentum (20%)
        if momentum_haussier:
            score_long += 2
        if momentum_baissier:
            score_short += 2
            
        # Composante de breakout (20%)
        if breakout_haut:
            score_long += 2
        if breakout_bas:
            score_short += 2
            
                # Composante MACD (10%)
        if macd_haussier:
            score_long += 1
        if macd_baissier:
            score_short += 1
            
        # Composante Bollinger (10%)
        if bb_casse_haut and bb_expansion:
            score_long += 1
        if bb_casse_bas and bb_expansion:
            score_short += 1
            
        # Bonus pour les patterns de chandeliers et divergences (10%)
        if pattern_haussier or divergence_haussiere:
            score_long += 1
        if pattern_baissier or divergence_baissiere:
            score_short += 1
            
        # Bonus pour le volume élevé
        if volume_eleve:
            score_long += 0.5
            score_short += 0.5
            
        # Seuil de décision (7/10 = 70% de confiance)
        signal_achat = score_long >= 7
        signal_vente = score_short >= 7
        
        # Enregistrer la force du signal pour l'analyse
        force_signal = max(score_long, score_short) / 10
        if symbole not in self.tendances_marche:
            self.tendances_marche[symbole] = {}
        self.tendances_marche[symbole]['force_signal'] = force_signal
        
        return signal_achat, signal_vente

    def calculer_frais(self, quantite, prix, levier):
        """Calcule les frais de trading"""
        valeur_position = quantite * prix
        # Utiliser le taux taker par défaut (plus conservateur)
        return valeur_position * TAKER_FEE

    def executer_trade(self, symbole, action, prix, levier, sl_pct=None, tp_pct=None):
        """Exécute un trade avec gestion des risques améliorée"""
        try:
            with self.lock:
                horodatage = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                
                # Ajuster le risque en fonction des performances récentes
                risque_base = RISK_PER_TRADE
                
                # Augmenter le risque après une série de trades gagnants
                if self.trades_gagnants_consecutifs >= 3:
                    risque_utilise = min(0.4, risque_base * (1 + 0.1 * min(self.trades_gagnants_consecutifs, 5)))
                # Réduire le risque après une série de trades perdants
                elif self.trades_perdants_consecutifs >= 2:
                    risque_utilise = max(0.15, risque_base * (1 - 0.1 * min(self.trades_perdants_consecutifs, 5)))
                else:
                    risque_utilise = risque_base
                
                # Calculer la taille de la position
                montant_risque = self.balance * risque_utilise
                marge = montant_risque / levier
                quantite = (montant_risque * levier) / prix
                
                # Calculer les frais
                frais = self.calculer_frais(quantite, prix, levier)
                
                if action == 'acheter' and self.balance > 10 and len(self.positions) < MAX_POSITIONS:
                    if symbole not in self.positions:
                        # Définir les niveaux de stop loss et take profit
                        prix_sl = prix * (1 - sl_pct) if sl_pct else None
                        prix_tp = prix * (1 + tp_pct) if tp_pct else None
                        
                        self.positions[symbole] = {
                            'quantite': quantite,
                            'prix_entree': prix,
                            'levier': levier,
                            'marge_initiale': marge,
                            'direction': 'long',
                            'heure_entree': horodatage,
                            'stop_loss': prix_sl,
                            'take_profit': prix_tp,
                            'risque_utilise': risque_utilise,
                            'frais_entree': frais
                        }
                        self.balance -= (marge + frais)
                        self.frais_cumules += frais
                        
                        # Log simplifié dans la console
                        print(f"✅ LONG {symbole} | Prix: {prix:.4f} | Levier: {levier}x | SL: {prix_sl:.4f} | TP: {prix_tp:.4f}")
                        
                        # Log détaillé dans le fichier
                        logger.info(f"OUVERTURE LONG {symbole} | Qté: {quantite:.6f} | Prix: {prix:.4f} | Levier: {levier}x | SL: {prix_sl:.4f} | TP: {prix_tp:.4f} | Frais: {frais:.4f} USDT | Risque: {risque_utilise*100:.1f}%")
                        
                        # Ajouter à l'historique des trades
                        self.historique_trades.append({
                            'symbole': symbole,
                            'action': 'ouverture_long',
                            'prix': prix,
                            'quantite': quantite,
                            'levier': levier,
                            'horodatage': horodatage,
                            'marge': marge,
                            'frais': frais
                        })

                elif action == 'vendre_short' and self.balance > 10 and len(self.positions) < MAX_POSITIONS:
                    if symbole not in self.positions:
                        # Définir les niveaux de stop loss et take profit
                        prix_sl = prix * (1 + sl_pct) if sl_pct else None
                        prix_tp = prix * (1 - tp_pct) if tp_pct else None
                        
                        self.positions[symbole] = {
                            'quantite': quantite,
                            'prix_entree': prix,
                            'levier': levier,
                            'marge_initiale': marge,
                            'direction': 'short',
                            'heure_entree': horodatage,
                            'stop_loss': prix_sl,
                            'take_profit': prix_tp,
                            'risque_utilise': risque_utilise,
                            'frais_entree': frais
                        }
                        self.balance -= (marge + frais)
                        self.frais_cumules += frais
                        
                        # Log simplifié dans la console
                        print(f"✅ SHORT {symbole} | Prix: {prix:.4f} | Levier: {levier}x | SL: {prix_sl:.4f} | TP: {prix_tp:.4f}")
                        
                        # Log détaillé dans le fichier
                        logger.info(f"OUVERTURE SHORT {symbole} | Qté: {quantite:.6f} | Prix: {prix:.4f} | Levier: {levier}x | SL: {prix_sl:.4f} | TP: {prix_tp:.4f} | Frais: {frais:.4f} USDT | Risque: {risque_utilise*100:.1f}%")
                        
                        # Ajouter à l'historique des trades
                        self.historique_trades.append({
                            'symbole': symbole,
                            'action': 'ouverture_short',
                            'prix': prix,
                            'quantite': quantite,
                            'levier': levier,
                            'horodatage': horodatage,
                            'marge': marge,
                            'frais': frais
                        })

                elif action == 'fermer' and symbole in self.positions:
                    position = self.positions[symbole]
                    prix_entree = position['prix_entree']
                    levier_pos = position['levier']
                    quantite_pos = position['quantite']
                    
                    # Calculer les frais de sortie
                    frais_sortie = self.calculer_frais(quantite_pos, prix, levier_pos)
                    frais_total = position.get('frais_entree', 0) + frais_sortie
                    
                    # Calculer le profit/perte
                    if position['direction'] == 'long':
                        profit_pct = (prix / prix_entree - 1) * 100 * levier_pos
                        profit_brut = (prix - prix_entree) / prix_entree * quantite_pos * prix * levier_pos
                    else:
                        profit_pct = (prix_entree / prix - 1) * 100 * levier_pos
                        profit_brut = (prix_entree - prix) / prix_entree * quantite_pos * prix * levier_pos
                    
                    # Profit net après frais
                    profit_net = profit_brut - frais_total
                    
                    # Mettre à jour le solde
                    self.balance += (position['marge_initiale'] + profit_net)
                    self.frais_cumules += frais_sortie
                    
                    # Calculer la durée du trade
                    duree_trade = datetime.strptime(horodatage, '%Y-%m-%d %H:%M:%S') - datetime.strptime(position['heure_entree'], '%Y-%m-%d %H:%M:%S')
                    duree_minutes = duree_trade.total_seconds() / 60
                    
                    # Déterminer le type de fermeture (SL, TP ou manuel)
                    raison_fermeture = "manuel"
                    if position.get('stop_loss') and ((position['direction'] == 'long' and prix <= position['stop_loss']) or 
                                                     (position['direction'] == 'short' and prix >= position['stop_loss'])):
                        raison_fermeture = "SL"
                    elif position.get('take_profit') and ((position['direction'] == 'long' and prix >= position['take_profit']) or 
                                                         (position['direction'] == 'short' and prix <= position['take_profit'])):
                        raison_fermeture = "TP"
                    elif position.get('trailing_stop') and ((position['direction'] == 'long' and prix <= position['trailing_stop']) or 
                                                           (position['direction'] == 'short' and prix >= position['trailing_stop'])):
                        raison_fermeture = "TS"
                    
                    # Log simplifié dans la console
                    emoji = "🟢" if profit_net > 0 else "🔴"
                    print(f"{emoji} FERMETURE {position['direction'].upper()} {symbole} | Prix: {prix:.4f} | P/L: {profit_net:.2f} USDT ({profit_pct:.2f}%) | Raison: {raison_fermeture}")
                    
                    # Log détaillé dans le fichier
                    logger.info(f"FERMETURE {position['direction'].upper()} {symbole} | Prix: {prix:.4f} | Profit brut: {profit_brut:.2f} USDT | Frais: {frais_total:.2f} USDT | Profit net: {profit_net:.2f} USDT ({profit_pct:.2f}%) | Durée: {duree_minutes:.1f} min | Solde: {self.balance:.2f} USDT | Raison: {raison_fermeture}")
                    
                    # Mettre à jour les séries de trades gagnants/perdants
                    if profit_net > 0:
                        self.trades_gagnants_consecutifs += 1
                        self.trades_perdants_consecutifs = 0
                        if self.trades_gagnants_consecutifs > self.historique_performance["series_gagnantes"]["max"]:
                            self.historique_performance["series_gagnantes"]["max"] = self.trades_gagnants_consecutifs
                        self.historique_performance["series_gagnantes"]["actuelle"] = self.trades_gagnants_consecutifs
                    else:
                        self.trades_perdants_consecutifs += 1
                        self.trades_gagnants_consecutifs = 0
                        if self.trades_perdants_consecutifs > self.historique_performance["series_perdantes"]["max"]:
                            self.historique_performance["series_perdantes"]["max"] = self.trades_perdants_consecutifs
                        self.historique_performance["series_perdantes"]["actuelle"] = self.trades_perdants_consecutifs
                    
                    # Ajouter à l'historique des trades et au suivi des performances
                    enregistrement_trade = {
                        'symbole': symbole,
                        'action': f"fermeture_{position['direction']}",
                        'prix_entree': prix_entree,
                        'prix_sortie': prix,
                        'profit_brut': profit_brut,
                        'frais': frais_total,
                        'profit_net': profit_net,
                        'profit_pct': profit_pct,
                        'levier': levier_pos,
                        'date_entree': position['heure_entree'],
                        'date_sortie': horodatage,
                        'duree_minutes': duree_minutes,
                        'raison_fermeture': raison_fermeture
                    }
                    
                    self.historique_trades.append(enregistrement_trade)
                    self.historique_performance['trades'].append(enregistrement_trade)
                    
                    # Mettre à jour le taux de réussite
                    total_trades = len(self.historique_performance['trades'])
                    trades_gagnants = sum(1 for t in self.historique_performance['trades'] if t.get('profit_net', 0) > 0)
                    self.historique_performance['taux_reussite'] = (trades_gagnants / total_trades) * 100 if total_trades > 0 else 0
                    self.historique_performance['profit_total'] += profit_net
                    self.historique_performance['frais_total'] += frais_total
                    
                    # Mettre à jour le meilleur/pire trade
                    if not self.historique_performance['meilleur_trade']['symbole'] or profit_net > self.historique_performance['meilleur_trade']['profit']:
                        self.historique_performance['meilleur_trade'] = {'symbole': symbole, 'profit': profit_net}
                    if not self.historique_performance['pire_trade']['symbole'] or profit_net < self.historique_performance['pire_trade']['profit']:
                        self.historique_performance['pire_trade'] = {'symbole': symbole, 'profit': profit_net}
                    
                                        # Mettre à jour le PnL quotidien
                    aujourd_hui = datetime.now().strftime('%Y-%m-%d')
                    if aujourd_hui not in self.historique_performance['pnl_quotidien']:
                        self.historique_performance['pnl_quotidien'][aujourd_hui] = 0
                    self.historique_performance['pnl_quotidien'][aujourd_hui] += profit_net
                    
                    # Mettre à jour le nombre de trades
                    if 'nombre_trades' not in self.historique_performance:
                        self.historique_performance['nombre_trades'] = {'total': 0, 'gagnants': 0, 'perdants': 0}
                    self.historique_performance['nombre_trades']['total'] += 1
                    if profit_net > 0:
                        self.historique_performance['nombre_trades']['gagnants'] += 1
                    else:
                        self.historique_performance['nombre_trades']['perdants'] += 1
                    
                    # Enregistrer le trade dans le CSV
                    with open(TRADES_LOG_FILE, 'a', encoding='utf-8') as f:
                        f.write(f"{horodatage},{symbole},{position['direction']},{prix_entree:.4f},{prix:.4f},{quantite_pos:.6f},{levier_pos},{profit_net:.2f},{profit_pct:.2f},{frais_total:.2f},{duree_minutes:.1f}\n")
                    
                    # Supprimer la position
                    del self.positions[symbole]
                    
                    # Sauvegarder l'historique des performances périodiquement
                    if time.time() - self.derniere_sauvegarde > 300:  # Toutes les 5 minutes
                        self._sauvegarder_historique_performance()
                        self.derniere_sauvegarde = time.time()
                
        except Exception as e:
            logger.error(f"Erreur lors de l'exécution du trade pour {symbole}: {e}")

    def verifier_stop_loss_take_profit(self, symbole, prix_actuel):
        """Vérifie et gère les stop-loss et take-profit pour une position"""
        if symbole not in self.positions:
            return
            
        position = self.positions[symbole]
        direction = position['direction']
        prix_entree = position['prix_entree']
        
        # Vérifier le stop loss
        if position.get('stop_loss'):
            if (direction == 'long' and prix_actuel <= position['stop_loss']) or \
               (direction == 'short' and prix_actuel >= position['stop_loss']):
                self.executer_trade(symbole, 'fermer', prix_actuel, position['levier'])
                return
        
        # Vérifier le take profit
        if position.get('take_profit'):
            if (direction == 'long' and prix_actuel >= position['take_profit']) or \
               (direction == 'short' and prix_actuel <= position['take_profit']):
                self.executer_trade(symbole, 'fermer', prix_actuel, position['levier'])
                return
        
        # Vérifier le trailing stop
        if position.get('trailing_stop'):
            if (direction == 'long' and prix_actuel <= position['trailing_stop']) or \
               (direction == 'short' and prix_actuel >= position['trailing_stop']):
                self.executer_trade(symbole, 'fermer', prix_actuel, position['levier'])
                return
        
        # Calculer le profit actuel
        if direction == 'long':
            profit_pct = (prix_actuel / prix_entree - 1) * 100 * position['levier']
        else:
            profit_pct = (prix_entree / prix_actuel - 1) * 100 * position['levier']
        
        # Gérer le trailing stop dynamique
        if not position.get('trailing_actif', False):
            # Activer le trailing stop quand le profit atteint un certain seuil
            if profit_pct >= 2.0:  # Activer à 2% de profit
                if direction == 'long':
                    trailing_stop = prix_actuel * 0.995  # 0.5% sous le prix actuel
                else:
                    trailing_stop = prix_actuel * 1.005  # 0.5% au-dessus du prix actuel
                
                position['trailing_stop'] = trailing_stop
                position['trailing_actif'] = True
                position['niveau_activation_trailing'] = prix_actuel
                
                # Log dans le fichier uniquement
                logger.info(f"Trailing stop activé pour {symbole} {direction.upper()} à {trailing_stop:.4f} (Profit: {profit_pct:.2f}%)")
        
        # Mettre à jour le trailing stop si le prix continue de bouger favorablement
        elif position.get('trailing_actif', False):
            if direction == 'long' and prix_actuel > position.get('niveau_activation_trailing', 0):
                # Déplacer le trailing stop vers le haut
                nouveau_trailing = prix_actuel * 0.995
                if nouveau_trailing > position['trailing_stop']:
                    position['trailing_stop'] = nouveau_trailing
                    position['niveau_activation_trailing'] = prix_actuel
                    # Log dans le fichier uniquement
                    logger.info(f"Trailing stop ajusté pour {symbole} LONG à {nouveau_trailing:.4f}")
            
            elif direction == 'short' and prix_actuel < position.get('niveau_activation_trailing', float('inf')):
                # Déplacer le trailing stop vers le bas
                nouveau_trailing = prix_actuel * 1.005
                if nouveau_trailing < position['trailing_stop']:
                    position['trailing_stop'] = nouveau_trailing
                    position['niveau_activation_trailing'] = prix_actuel
                    # Log dans le fichier uniquement
                    logger.info(f"Trailing stop ajusté pour {symbole} SHORT à {nouveau_trailing:.4f}")
        
        # Déplacer le stop loss au break-even après un certain profit
        if not position.get('breakeven_actif', False) and profit_pct >= 1.0:
            if direction == 'long':
                nouveau_sl = prix_entree * 1.001  # Légèrement au-dessus du prix d'entrée
            else:
                nouveau_sl = prix_entree * 0.999  # Légèrement en-dessous du prix d'entrée
            
            position['stop_loss'] = nouveau_sl
            position['breakeven_actif'] = True
            
            # Log dans le fichier uniquement
            logger.info(f"Stop loss déplacé au break-even pour {symbole} {direction.upper()} à {nouveau_sl:.4f}")
        
        # Prendre des profits partiels
        if not position.get('profit_partiel_pris', False) and profit_pct >= 3.0:
            # Fermer la moitié de la position
            position_originale = position.copy()
            
            # Réduire la quantité de moitié
            position['quantite'] /= 2
            position['marge_initiale'] /= 2
            position['profit_partiel_pris'] = True
            
            # Calculer le profit pour la partie fermée
            if direction == 'long':
                profit_brut = (prix_actuel - prix_entree) / prix_entree * (position_originale['quantite'] / 2) * prix_actuel * position['levier']
            else:
                profit_brut = (prix_entree - prix_actuel) / prix_entree * (position_originale['quantite'] / 2) * prix_actuel * position['levier']
            
            # Calculer les frais
            frais = self.calculer_frais(position_originale['quantite'] / 2, prix_actuel, position['levier'])
            profit_net = profit_brut - frais
            
            # Mettre à jour le solde
            self.balance += (position_originale['marge_initiale'] / 2 + profit_net)
            self.frais_cumules += frais
            
            # Log simplifié dans la console
            print(f"🔄 PROFIT PARTIEL {symbole} {direction.upper()} | Prix: {prix_actuel:.4f} | P/L: {profit_net:.2f} USDT ({profit_pct:.2f}%)")
            
            # Log détaillé dans le fichier
            logger.info(f"PROFIT PARTIEL {symbole} {direction.upper()} | Prix: {prix_actuel:.4f} | Profit: {profit_net:.2f} USDT ({profit_pct:.2f}%) | Frais: {frais:.2f} USDT")

    def analyser_conditions_marche(self, symbole):
        """Analyse les conditions du marché pour un symbole donné"""
        try:
            temps_actuel = time.time()
            
            # Vérifier si une analyse récente existe déjà
            if symbole in self.derniere_analyse and temps_actuel - self.derniere_analyse[symbole] < 300:  # 5 minutes
                return
                
            # Récupérer les données sur plusieurs timeframes
            df_1m = self.recuperer_ohlcv(symbole, '1m', 100)
            df_5m = self.recuperer_ohlcv(symbole, '5m', 100)
            df_15m = self.recuperer_ohlcv(symbole, '15m', 50)
            df_1h = self.recuperer_ohlcv(symbole, '1h', 24)
            
            if df_1m is None or df_5m is None or df_15m is None or df_1h is None:
                return
                
            # Calculer les indicateurs
            df_1m = self.calculer_indicateurs(df_1m)
            df_5m = self.calculer_indicateurs(df_5m)
            df_15m = self.calculer_indicateurs(df_15m)
            df_1h = self.calculer_indicateurs(df_1h)
            
            # Déterminer la tendance sur chaque timeframe
            tendance_1m = 'haussière' if df_1m['ema_8'].iloc[-1] > df_1m['ema_21'].iloc[-1] else 'baissière'
            tendance_5m = 'haussière' if df_5m['ema_8'].iloc[-1] > df_5m['ema_21'].iloc[-1] else 'baissière'
            tendance_15m = 'haussière' if df_15m['ema_8'].iloc[-1] > df_15m['ema_21'].iloc[-1] else 'baissière'
            tendance_1h = 'haussière' if df_1h['ema_8'].iloc[-1] > df_1h['ema_21'].iloc[-1] else 'baissière'
            
            # Déterminer l'alignement global des tendances
            alignement_tendance = sum([
                1 if tendance == 'haussière' else -1 
                for tendance in [tendance_1m, tendance_5m, tendance_15m, tendance_1h]
            ])
            
            # Déterminer la volatilité
            volatilite_1m = df_1m['close'].pct_change().std() * 100
            volatilite_1h = df_1h['close'].pct_change().std() * 100
            
            # Déterminer la tendance du volume
            tendance_volume = 'en hausse' if df_5m['volume'].iloc[-5:].mean() > df_5m['volume'].iloc[-10:-5].mean() else 'en baisse'
            
            # Stocker l'analyse du marché
            self.tendances_marche[symbole] = {
                'alignement_tendance': alignement_tendance,
                'tendance_1m': tendance_1m,
                'tendance_5m': tendance_5m,
                'tendance_15m': tendance_15m,
                'tendance_1h': tendance_1h,
                'volatilite_court': volatilite_1m,
                'volatilite_long': volatilite_1h,
                'tendance_volume': tendance_volume,
                'heure_analyse': temps_actuel,
                'force_signal': abs(alignement_tendance) / 4  # Normaliser entre 0 et 1
            }
            
            self.derniere_analyse[symbole] = temps_actuel
            
            # Log détaillé uniquement dans le fichier
            logger.info(f"Analyse du marché pour {symbole}: Alignement tendance: {alignement_tendance}, Volatilité: {volatilite_1m:.2f}%, Volume: {tendance_volume}")
            
        except Exception as e:
            logger.error(f"Erreur lors de l'analyse des conditions du marché pour {symbole}: {e}")

    def gerer_positions_ouvertes(self):
        """Gère les positions existantes - ajuste les stops, prend des profits partiels, etc."""
        for symbole in list(self.positions.keys()):
            try:
                position = self.positions[symbole]
                df = self.recuperer_ohlcv(symbole, '1m', 30)
                
                if df is None or len(df) < 20:
                    continue
                    
                prix_actuel = df['close'].iloc[-1]
                prix_entree = position['prix_entree']
                direction = position['direction']
                duree = datetime.now() - datetime.strptime(position['heure_entree'], '%Y-%m-%d %H:%M:%S')
                duree_minutes = duree.total_seconds() / 60
                
                # Calculer le profit/perte actuel
                if direction == 'long':
                    profit_pct = (prix_actuel / prix_entree - 1) * 100 * position['levier']
                else:
                    profit_pct = (prix_entree / prix_actuel - 1) * 100 * position['levier']
                
                # Vérifier le stop loss / take profit
                self.verifier_stop_loss_take_profit(symbole, prix_actuel)
                
                # Fermer les positions ouvertes depuis trop longtemps avec un profit/perte minimal
                if duree_minutes > 120 and abs(profit_pct) < 1:  # 2 heures avec <1% de profit/perte
                    # Log uniquement dans le fichier
                    logger.info(f"Fermeture de position stagnante pour {symbole} après {duree_minutes:.1f} minutes")
                    self.executer_trade(symbole, 'fermer', prix_actuel, position['levier'])
                
                                # Fermer les positions perdantes ouvertes depuis trop longtemps
                if duree_minutes > 240 and profit_pct < -1:  # 4 heures avec perte
                    # Log uniquement dans le fichier
                    logger.info(f"Fermeture de position perdante pour {symbole} après {duree_minutes:.1f} minutes (P/L: {profit_pct:.2f}%)")
                    self.executer_trade(symbole, 'fermer', prix_actuel, position['levier'])
                
                # Vérifier si la tendance s'est inversée
                df = self.calculer_indicateurs(df)
                tendance_actuelle = 'haussière' if df['ema_8'].iloc[-1] > df['ema_21'].iloc[-1] else 'baissière'
                
                if (direction == 'long' and tendance_actuelle == 'baissière' and profit_pct > 0) or \
                   (direction == 'short' and tendance_actuelle == 'haussière' and profit_pct > 0):
                    # Log uniquement dans le fichier
                    logger.info(f"Fermeture de position pour {symbole} suite à inversion de tendance (P/L: {profit_pct:.2f}%)")
                    self.executer_trade(symbole, 'fermer', prix_actuel, position['levier'])
                
            except Exception as e:
                logger.error(f"Erreur lors de la gestion de la position pour {symbole}: {e}")

    def demarrer_taches_arriere_plan(self):
        """Démarre les tâches d'analyse en arrière-plan"""
        def analyser_marche_periodiquement():
            while self.running:
                try:
                    for symbole in self.paires:
                        self.analyser_conditions_marche(symbole)
                        time.sleep(1)  # Pause entre chaque analyse pour éviter de surcharger l'API
                    time.sleep(300)  # Analyser toutes les 5 minutes
                except Exception as e:
                    logger.error(f"Erreur dans l'analyse périodique du marché: {e}")
                    time.sleep(60)
        
        def gerer_positions_periodiquement():
            while self.running:
                try:
                    self.gerer_positions_ouvertes()
                    time.sleep(30)  # Vérifier toutes les 30 secondes
                except Exception as e:
                    logger.error(f"Erreur dans la gestion périodique des positions: {e}")
                    time.sleep(60)
        
        # Démarrer les threads
        Thread(target=analyser_marche_periodiquement, daemon=True).start()
        Thread(target=gerer_positions_periodiquement, daemon=True).start()
        
        logger.info("Tâches d'analyse en arrière-plan démarrées")

    def run(self, in_thread=False):
        """Fonction principale du bot"""
        print("Bot de scalping crypto démarré...")
        
        # Gérer l'arrêt propre du bot - seulement dans le thread principal
        if not in_thread:
            def gestionnaire_signal(sig, frame):
                print("\nArrêt du bot demandé...")
                self.running = False

            signal.signal(signal.SIGINT, gestionnaire_signal)
        
        compteur_cycle = 0
        
        while self.running:
            try:
                # Trier les paires par score de volatilité pour prioriser les plus volatiles
                paires_triees = sorted(self.paires, key=lambda x: self.scores_volatilite.get(x, 0), reverse=True)
                
                for symbole in paires_triees:
                    try:
                        # Récupérer et analyser les données
                        df_1m = self.recuperer_ohlcv(symbole, '1m', 100)
                        if df_1m is None or len(df_1m) < 30:
                            continue
                            
                        df_1m = self.calculer_indicateurs(df_1m)
                        prix_actuel = df_1m['close'].iloc[-1]
                        
                        # Vérifier les stop loss / take profit pour les positions existantes
                        if symbole in self.positions:
                            self.verifier_stop_loss_take_profit(symbole, prix_actuel)
                        
                        # Ajuster le levier et les niveaux de SL/TP
                        levier, sl_pct, tp_pct = self.ajuster_levier_et_niveaux(symbole, df_1m)
                        
                        # Vérifier les signaux d'entrée
                        signal_achat, signal_vente = self.verifier_signaux(df_1m, symbole)
                        
                        # Vérifier l'alignement des tendances sur plusieurs timeframes
                        alignement = self.tendances_marche.get(symbole, {}).get('alignement_tendance', 0)
                        
                        # Exécuter les trades en fonction des signaux et de l'alignement des tendances
                        if symbole in self.positions:
                            direction_actuelle = self.positions[symbole]['direction']
                            
                            # Fermer la position si le signal est contraire à la position actuelle
                            if (direction_actuelle == 'long' and signal_vente and alignement <= -2) or \
                               (direction_actuelle == 'short' and signal_achat and alignement >= 2):
                                self.executer_trade(symbole, 'fermer', prix_actuel, levier)
                                
                                # Ouvrir une position dans la direction opposée (inversion)
                                if direction_actuelle == 'long' and signal_vente:
                                    self.executer_trade(symbole, 'vendre_short', prix_actuel, levier, sl_pct, tp_pct)
                                elif direction_actuelle == 'short' and signal_achat:
                                    self.executer_trade(symbole, 'acheter', prix_actuel, levier, sl_pct, tp_pct)
                        else:
                            # Ouvrir une nouvelle position si le signal est fort et aligné avec les tendances
                            if signal_achat and alignement >= 2 and len(self.positions) < MAX_POSITIONS:
                                self.executer_trade(symbole, 'acheter', prix_actuel, levier, sl_pct, tp_pct)
                            elif signal_vente and alignement <= -2 and len(self.positions) < MAX_POSITIONS:
                                self.executer_trade(symbole, 'vendre_short', prix_actuel, levier, sl_pct, tp_pct)
                    
                    except Exception as e:
                        logger.error(f"Erreur pour {symbole}: {e}")
                
                # Journaliser le statut périodiquement (toutes les 100 itérations)
                compteur_cycle += 1
                if compteur_cycle % 100 == 0:
                    taux_reussite = self.historique_performance.get('taux_reussite', 0)
                    profit_total = self.historique_performance.get('profit_total', 0)
                    frais_total = self.historique_performance.get('frais_total', 0)
                    
                    # Log simplifié dans la console
                    print(f"📊 STATUT | Solde: {self.balance:.2f} USDT | Positions: {len(self.positions)} | Profit: {profit_total:.2f} USDT | Taux réussite: {taux_reussite:.1f}%")
                    
                    # Sauvegarder l'historique des performances
                    self._sauvegarder_historique_performance()
                
                # Pause pour économiser les ressources
                time.sleep(0.5)
                
            except Exception as e:
                logger.error(f"Erreur dans la boucle principale: {e}")
                time.sleep(5)
        
        # Sauvegarde finale avant de quitter
        self._sauvegarder_historique_performance()
        
        # Rapport final simplifié dans la console
        profit_total = self.historique_performance.get('profit_total', 0)
        taux_reussite = self.historique_performance.get('taux_reussite', 0)
        
        print(f"""
        ===== RAPPORT FINAL =====
        Solde final: {self.balance:.2f} USDT
        Performance: {((self.balance / self.balance_initiale) - 1) * 100:.2f}%
        Profit total: {profit_total:.2f} USDT
        Taux de réussite: {taux_reussite:.1f}%
        =========================
        """)


if __name__ == "__main__":
    try:
        # Message de bienvenue simplifié
        print("""
        ╔══════════════════════════════════════════════╗
        ║   BOT DE SCALPING CRYPTO - VERSION 2.0       ║
        ║   Trading haute fréquence sur futures        ║
        ╚══════════════════════════════════════════════╝
        """)
        
        # Initialiser et démarrer le bot
        bot = BotScalpingAvance()
        bot.run()
        
    except KeyboardInterrupt:
        print("\nArrêt manuel du bot...")
    except Exception as e:
        logger.critical(f"Erreur critique au démarrage: {e}")
        print(f"Erreur critique: {e}")
        sys.exit(1)


