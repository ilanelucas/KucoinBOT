#!/usr/bin/env python
"""
KuCoin Scalping Bot Launcher
----------------------------
Ce script lance le bot de trading KuCoin avec son interface web en utilisant
la nouvelle structure de projet séparant le backend et le frontend.
"""

import os
import sys
import logging
import webbrowser
from threading import Timer
import argparse

# Ajuster pour les chemins relatifs
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(current_dir, 'backend')
sys.path.append(backend_dir)  # Pour importer les modules du backend

def open_browser(port):
    """Ouvre le navigateur après un court délai pour laisser le serveur démarrer"""
    url = f"http://localhost:{port}"
    Timer(2.0, lambda: webbrowser.open(url)).start()
    print(f"Ouverture du navigateur sur {url}")

if __name__ == "__main__":
    # Analyser les arguments de ligne de commande
    parser = argparse.ArgumentParser(description="KuCoin Scalping Bot avec Interface Web")
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
        app_py_path = os.path.join(backend_dir, 'app.py')
        bot_py_path = os.path.join(backend_dir, 'botV0.py')
        
        if not os.path.exists(bot_py_path):
            print(f"Erreur : {bot_py_path} introuvable. Assurez-vous d'être dans le bon répertoire.")
            sys.exit(1)
            
        if not os.path.exists(app_py_path):
            print(f"Erreur : {app_py_path} introuvable. Assurez-vous d'être dans le bon répertoire.")
            sys.exit(1)
        
        print("Démarrage du bot de trading KuCoin avec l'interface web...")
        
        # Importer l'application Flask depuis le backend
        sys.path.insert(0, backend_dir)  # Priorité au chemin du backend
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