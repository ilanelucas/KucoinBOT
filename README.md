# KuCoin Scalping Bot

Un bot de trading automatisé pour le scalping sur KuCoin Futures avec une interface web moderne pour suivre et gérer vos opérations.

## Structure du Projet

Le projet est organisé selon une architecture séparant le backend et le frontend :

```
BOT/
├── backend/             # Code du serveur et logique de trading
│   ├── logs/            # Journaux d'application
│   ├── app.py           # Serveur Flask et API
│   ├── botV0.py         # Logique principale du bot de trading
│   └── run.py           # Script de lancement (obsolète)
│
├── frontend/            # Interface utilisateur
│   ├── static/          # Ressources statiques
│   │   ├── css/         # Feuilles de style
│   │   ├── js/          # Scripts JavaScript
│   │   └── img/         # Images et icônes
│   │
│   └── templates/       # Templates HTML
│
├── .env                 # Fichier de configuration des clés API (à créer)
└── run.py               # Script de lancement principal
```

## Prérequis

- Python 3.8 ou supérieur
- Connexion Internet stable
- Compte KuCoin Futures avec des clés API

## Installation

1. Clonez ce dépôt :
   ```
   git clone https://github.com/votre-utilisateur/kucoin-scalping-bot.git
   cd kucoin-scalping-bot
   ```

2. Installez les dépendances :
   ```
   pip install -r requirements.txt
   ```

3. Configurez vos clés API KuCoin:
   
   Créez un fichier `.env` à la racine du projet avec le contenu suivant:
   ```
   # Kucoin API credentials
   KUCOIN_API_KEY="votre_clé_api"
   KUCOIN_API_SECRET="votre_clé_secrète"
   KUCOIN_API_PASSPHRASE="votre_phrase_de_passe"
   ```
   
   Remplacez les valeurs par vos propres clés API KuCoin.

## Utilisation

### Démarrage rapide

Pour démarrer l'application avec les paramètres par défaut :

```
python run.py
```

L'interface web sera accessible à l'adresse : http://localhost:5000

### Options de ligne de commande

```
python run.py --help
```

Options disponibles :
- `--no-browser` : Ne pas ouvrir automatiquement le navigateur
- `--port PORT` : Port sur lequel lancer l'interface web (défaut : 5000)
- `--debug` : Exécuter en mode debug avec plus de verbosité

## Fonctionnalités

- Dashboard avec métriques de performance en temps réel
- Gestion des positions actives
- Historique des transactions
- Analyse du marché et tendances
- Configuration personnalisable
- Thème sombre/clair
- Interface responsive

## Sécurité

⚠️ **Attention** : 
- Ne partagez jamais vos clés API KuCoin.
- Protégez votre fichier `.env` contenant vos clés API. Ne le committez jamais dans un dépôt git.
- Utilisez uniquement ce bot sur un appareil sécurisé et dont vous avez le contrôle.

## Licence

Ce projet est sous licence [MIT](LICENSE). 