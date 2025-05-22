#!/usr/bin/env python
"""
KuCoin Scalping Bot Launcher (Backend)
--------------------------------------
Ce script lance le backend du bot de trading KuCoin.
Il est maintenu pour compatibilité mais il est recommandé
d'utiliser le run.py à la racine du projet.
"""

import os
import sys
import logging
import webbrowser
from threading import Timer
import argparse

# Ajuster pour les chemins relatifs
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(current_dir)  # Pour importer les modules dans ce dossier

def open_browser(port):
    """Ouvre le navigateur après un court délai pour laisser le serveur démarrer"""
    url = f"http://localhost:{port}"
    Timer(2.0, lambda: webbrowser.open(url)).start()
    print(f"Ouverture du navigateur sur {url}")
    print("ATTENTION: Ce script est obsolète. Utilisez plutôt le run.py à la racine du projet.")

if __name__ == "__main__":
    print("ATTENTION: Ce script est maintenu pour compatibilité mais il est")
    print("recommandé d'utiliser le run.py à la racine du projet.")
    
    # Analyser les arguments de ligne de commande
    parser = argparse.ArgumentParser(description="KuCoin Scalping Bot Backend")
    parser.add_argument("--no-browser", action="store_true", help="Ne pas ouvrir automatiquement le navigateur")
    parser.add_argument("--port", type=int, default=5000, help="Port sur lequel lancer l'interface web")
    parser.add_argument("--debug", action="store_true", help="Exécuter en mode debug avec plus de verbosité")
    
    args = parser.parse_args()
    
    # Configurer la journalisation
    log_level = logging.DEBUG if args.debug else logging.INFO
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Exécuter l'application
    try:
        # Vérifier si les fichiers nécessaires existent
        if not os.path.exists('botV0.py'):
            print("Erreur : botV0.py introuvable. Assurez-vous d'être dans le répertoire backend.")
            sys.exit(1)
            
        if not os.path.exists('app.py'):
            print("Erreur : app.py introuvable. Assurez-vous d'être dans le répertoire backend.")
            sys.exit(1)
        
        print("Démarrage du bot de trading KuCoin (mode obsolète)...")
        
        # Importer l'application Flask
        from app import app, socketio
        
        # Ouverture automatique du navigateur si non désactivée
        if not args.no_browser:
            open_browser(args.port)
        
        # Démarrer le serveur Flask
        socketio.run(app, host='0.0.0.0', port=args.port, debug=args.debug, allow_unsafe_werkzeug=True)
        
    except KeyboardInterrupt:
        print("\nArrêt en cours...")
    except Exception as e:
        print(f"Erreur : {e}")
        sys.exit(1) 