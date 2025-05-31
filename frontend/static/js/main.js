// Global variables
let socket;
// const refreshRate = 1000; // Not directly used for main data pushes via Socket.IO
let botRunning = false;
let chartInstances = {};
let lastDataHash = null; // Used to compare if data has actually changed
let lastDataTimestamp = 0;
let balanceHistory = [];
let themeMode = 'dark';
const pendingAnimations = new Set(); // Pour suivre les animations en cours
let connectionAttempts = 0;
const maxConnectionAttempts = 5;
let reconnectDelay = 2000; // Délai initial de reconnexion en ms
let reconnectTimer = null;

// Cache pour les données des positions précédentes pour optimiser les updates
const positionsCache = new Map();

// DOM elements cache
let startBotBtn, stopBotBtn, statusIndicator, botStatusText,
    balanceValueEl, roiValueEl, winRateValueEl, profitValueEl, // Renamed for clarity
    lastUpdateTimeEl, themeToggle, refreshBtn, sidebarLinks, sections,
    activePositionsTableBody, recentTradesTableBody, marketTrendsTableBody,
    tradeHistoryTableBody, // Added for trade history section
    portfolioHistoryChartEl, balanceChartEl,
    initialBalanceValueEl, currentBalanceValueEl, totalProfitValueEl, activePositionsCountEl,
    performanceWinRateEl, totalTradesCountEl, winningTradesCountEl, losingTradesCountEl,
    bestWinStreakEl, worstLossStreakEl, sharpeRatioEl, maxDrawdownEl,
    portfolioROIEl, tradesCountBadgeEl;


// Fonction pour exécuter les animations dans un requestAnimationFrame
// This function seems to have been replaced or integrated into queueAnimation
// function processAnimationQueue() {
//     if (animationQueue.length === 0) {
//         animationFrameRequested = false;
//         return;
//     }

//     const now = performance.now();
//     while (animationQueue.length > 0) {
//         const animation = animationQueue.shift();
//         try {
//             animation.callback();
//         } catch (err) {
//             console.error('Animation error:', err);
//         }

//         // Éviter de bloquer le thread trop longtemps
//         if (performance.now() - now > 16) { // ~60fps
//             break;
//         }
//     }

//     if (animationQueue.length > 0) {
//         requestAnimationFrame(processAnimationQueue);
//     } else {
//         animationFrameRequested = false;
//     }
// }

// Fonction pour ajouter une animation à la file d'attente
// Simplified usage of requestAnimationFrame directly for DOM updates for now.
// The queueAnimation system can be re-introduced if complex sequencing is needed.
// function queueAnimation(callback, priority = 0) {
//     animationQueue.push({ callback, priority });
//     animationQueue.sort((a, b) => b.priority - a.priority);

//     if (!animationFrameRequested) {
//         animationFrameRequested = true;
//         requestAnimationFrame(processAnimationQueue);
//     }
// }

// Fonction pour ajouter des classes d'animation aux éléments
function animateElement(element, className, duration = 1000) {
    if (!element) return;

    element.classList.add(className);
    setTimeout(() => {
        element.classList.remove(className);
    }, duration);
}

// Fonction pour animer les changements de valeur
function animateValue(element, start, end, duration = 1000, prefix = '', suffix = '') {
    if (!element) return;

    // Si les valeurs sont déjà égales, pas besoin d'animation
    if (start === end && element.textContent === prefix + end.toFixed(2) + suffix) {
        // element.textContent = prefix + end.toFixed(2) + suffix; // Already set, or no change needed
        return;
    }

    // Marquer l'élément comme animé
    element.classList.add('animated-value');

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = easeOutCubic(progress);
        const currentValue = start + easeProgress * (end - start);
        element.textContent = prefix + currentValue.toFixed(2) + suffix;

        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            // Animation terminée, retirer la classe
            setTimeout(() => {
                element.classList.remove('animated-value');
            }, 200);
        }
    };

    requestAnimationFrame(step);
}

// Fonction d'easing pour les animations
function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
}


// Cache DOM selectors on DOMContentLoaded
function cacheDOMElements() {
    startBotBtn = document.getElementById('startBot');
    stopBotBtn = document.getElementById('stopBot');
    statusIndicator = document.getElementById('statusIndicator');
    botStatusText = document.getElementById('botStatusText');
    balanceValueEl = document.getElementById('balanceValue');
    roiValueEl = document.getElementById('roiValue');
    winRateValueEl = document.getElementById('winRateValue');
    profitValueEl = document.getElementById('profitValue');
    lastUpdateTimeEl = document.getElementById('lastUpdateTime');
    themeToggle = document.querySelector('.theme-toggle');
    refreshBtn = document.querySelector('.refresh-btn');
    sidebarLinks = document.querySelectorAll('.sidebar-menu a');
    sections = document.querySelectorAll('.section');

    activePositionsTableBody = document.getElementById('activePositionsTable')?.querySelector('tbody');
    recentTradesTableBody = document.getElementById('recentTradesTable')?.querySelector('tbody');
    marketTrendsTableBody = document.getElementById('marketTrendsTable')?.querySelector('tbody');
    tradeHistoryTableBody = document.getElementById('tradeHistoryTable')?.querySelector('tbody');

    portfolioHistoryChartEl = document.getElementById('portfolioHistoryChart');
    balanceChartEl = document.getElementById('balanceChart');

    initialBalanceValueEl = document.getElementById('initialBalanceValue');
    currentBalanceValueEl = document.getElementById('currentBalanceValue');
    totalProfitValueEl = document.getElementById('totalProfitValue');
    activePositionsCountEl = document.getElementById('activePositionsCount');

    performanceWinRateEl = document.getElementById('performanceWinRate');
    totalTradesCountEl = document.getElementById('totalTradesCount');
    winningTradesCountEl = document.getElementById('winningTradesCount');
    losingTradesCountEl = document.getElementById('losingTradesCount');
    bestWinStreakEl = document.getElementById('bestWinStreak');
    worstLossStreakEl = document.getElementById('worstLossStreak');
    sharpeRatioEl = document.getElementById('sharpeRatio');
    maxDrawdownEl = document.getElementById('maxDrawdown');
    portfolioROIEl = document.getElementById('portfolioROI');
    tradesCountBadgeEl = document.getElementById('tradesCountBadge');
}


// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    cacheDOMElements(); // Cache DOM elements first

    // Afficher un indicateur de chargement initial
    showLoadingOverlay();

    // Connect to Socket.IO server
    initializeSocketConnection();

    // Setup event listeners
    setupEventListeners();

    // Check bot status
    checkBotStatus()
        .then(() => {
            // Setup charts une fois le statut récupéré
            setupCharts();

            // Load theme from local storage
            loadTheme();

            // Mise en place de l'état du système
            setupSystemStatus();

            // Cacher l'overlay une fois tout chargé
            hideLoadingOverlay();

            // Vérifier la santé du bot périodiquement
            setInterval(checkBotHealth, 30000);
        })
        .catch(error => {
            console.error('Error initializing app:', error);
            hideLoadingOverlay();
            createToast('Erreur', 'Impossible de se connecter au serveur', 'error');
        });

    // Ajouter des tooltips aux éléments qui ont un attribut data-tooltip
    addTooltipsToElements();
});

// Fonction pour ajouter des tooltips aux éléments
function addTooltipsToElements() {
    const tooltipElements = document.querySelectorAll('[data-tooltip]');
    tooltipElements.forEach(element => {
        // Les tooltips sont gérés en CSS, rien à faire ici
        // Cette fonction est extensible pour des tooltips plus complexes
    });
}

// Fonction pour afficher un overlay de chargement
function showLoadingOverlay() {
    // Créer l'overlay s'il n'existe pas déjà
    if (!document.getElementById('loadingOverlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-text">Chargement de l'interface...</div>
        `;
        document.body.appendChild(overlay);

        // Ajouter les styles si nécessaire
        if (!document.getElementById('loadingOverlayStyles')) {
            const style = document.createElement('style');
            style.id = 'loadingOverlayStyles';
            style.textContent = `
                .loading-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(16, 21, 45, 0.9);
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    z-index: 9999;
                    transition: opacity 0.5s ease;
                }
                .loading-spinner {
                    width: 50px;
                    height: 50px;
                    border: 3px solid rgba(0, 0, 0, 0.1);
                    border-radius: 50%;
                    border-top-color: var(--primary-color);
                    animation: spin 1s ease-in-out infinite;
                }
                .loading-text {
                    margin-top: 20px;
                    color: var(--dark-heading);
                    font-size: 1.2rem;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }
}

// Fonction pour cacher l'overlay de chargement
function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
        }, 500);
    }
}

// Nouvelle fonction pour vérifier la santé du bot
function checkBotHealth() {
    fetch('/api/system_status')
        .then(response => response.json())
        .then(data => {
            // Mettre à jour les indicateurs de santé du bot
            if (data.bot_status === 'running') {
                updateSystemStatus(data);
            } else if (botRunning) {
                // Le bot est censé être en cours d'exécution mais il ne répond pas
                createToast('Attention', 'Le bot semble ne plus répondre', 'warning');
            }
        })
        .catch(error => {
            console.error('Erreur lors de la vérification de la santé du bot:', error);
            if (botRunning) {
                createToast('Problème de connexion', 'Impossible de contacter le serveur', 'error');
            }
        });
}

// Initialize Socket.IO connection
function initializeSocketConnection() {
    socket = io({
        reconnectionDelay: reconnectDelay,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: maxConnectionAttempts,
        timeout: 10000
    });

    socket.on('connect', () => {
        console.log('Connected to server');
        createToast('Connecté', 'Connexion établie avec le serveur', 'success');
        socket.emit('start_background_task');

        // Réinitialiser les variables de reconnexion
        connectionAttempts = 0;
        reconnectDelay = 2000;

        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        // Vérifier l'état du bot après reconnexion
        checkBotStatus();
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        connectionAttempts++;

        // Si nous avons atteint le nombre maximal de tentatives, notifier l'utilisateur
        if (connectionAttempts >= maxConnectionAttempts) {
            createToast('Problème de connexion', 'Impossible de se connecter au serveur. Veuillez rafraîchir la page.', 'error');

            // Tenter une reconnexion après un délai plus long
            if (!reconnectTimer) {
                reconnectTimer = setTimeout(() => {
                    // Augmenter le délai pour les tentatives suivantes (backoff exponentiel)
                    reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
                    socket.io.opts.reconnectionDelay = reconnectDelay;
                    socket.io.opts.reconnectionAttempts = maxConnectionAttempts;

                    // Réessayer de se connecter
                    socket.connect();
                    reconnectTimer = null;
                }, reconnectDelay);
            }
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);

        if (reason === 'io server disconnect') {
            // La déconnexion a été initiée par le serveur, nous devons nous reconnecter manuellement
            createToast('Déconnecté', 'Connexion perdue, tentative de reconnexion...', 'warning');
            socket.connect();
        } else if (reason === 'transport close' || reason === 'ping timeout') {
            // Problème réseau, les tentatives de reconnexion automatiques seront effectuées
            createToast('Connexion instable', 'Tentative de reconnexion...', 'warning');
        } else {
            createToast('Déconnecté', 'Connexion au serveur perdue', 'error');
        }
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`Tentative de reconnexion #${attemptNumber}`);
        document.body.classList.add('connection-issue');
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log(`Reconnecté après ${attemptNumber} tentatives`);
        document.body.classList.remove('connection-issue');
        createToast('Reconnecté', 'Connexion rétablie avec le serveur', 'success');
    });

    socket.on('data_update', (data) => {
        if (data) {
            document.body.classList.remove('connection-issue');

            const currentHash = JSON.stringify(data); // Simple hash, consider a more robust one for large objects
            if (currentHash === lastDataHash) {
                // Data hasn't changed, no need to update UI
                return;
            }
            lastDataHash = currentHash;

            requestAnimationFrame(() => { // Queue the entire UI update
                applyDataUpdate(data);
                lastDataTimestamp = data.timestamp || Date.now();
            });
        }
    });

    // Gestion des pings - pour éviter les mises à jour inutiles
    socket.on('data_ping', (data) => {
        document.body.classList.remove('connection-issue');

        // Vérification si nous avons déjà des données fraîches
        if (data.timestamp && (!lastDataTimestamp || data.timestamp > lastDataTimestamp)) {
            refreshData(); // Récupérer les données complètes si notre cache est obsolète
        }
    });

    // Notification d'état du bot
    socket.on('bot_status', (data) => {
        if (data && data.status) {
            updateBotStatus(data.status === 'running');
        }
    });

    // Ajouter des styles pour les problèmes de connexion
    if (!document.getElementById('connection-issue-style')) {
        const style = document.createElement('style');
        style.id = 'connection-issue-style';
        style.textContent = `
            .connection-issue::after {
                content: 'Connexion perdue, tentative de reconnexion...';
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                padding: 10px;
                background-color: var(--danger-color);
                color: white;
                text-align: center;
                font-weight: 500;
                z-index: 9999;
                transform: translateY(-100%);
                animation: slideDown 0.3s forwards;
            }

            @keyframes slideDown {
                to { transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }
}

// Fonction pour appliquer intelligemment les mises à jour
function applyDataUpdate(data) {
    // Ne mettez à jour l'interface que si les données ont changé
    // Hash check is now done in the socket.on('data_update') handler
    // if (!lastData || JSON.stringify(data) !== JSON.stringify(lastData)) { // lastData is not used anymore for this check
        if (data.status) {
            updateBotStatus(data.status === 'running');
        }

        // Mise à jour des métriques principales
        if (data.balance !== undefined && balanceValueEl) {
            balanceValueEl.textContent = data.balance.toFixed(2);

            // Ajouter à l'historique pour le graphique avec un timestamp
            const now = new Date();
            balanceHistory.push({
                time: now,
                balance: data.balance
            });

            // Garder seulement les 100 derniers points
            if (balanceHistory.length > 100) {
                balanceHistory.shift();
            }

            // Mettre à jour le graphique avec débounce pour éviter les ralentissements
            updateBalanceChartDebounced();
        }

        // Mise à jour des performances
        updatePerformanceData(data.performance);

        // Mise à jour des positions avec animation
        if (data.positions) {
            // requestAnimationFrame not needed here as applyDataUpdate is already wrapped
            updatePositionsTable(data.positions);
        }

        // Mise à jour des trades récents
        if (data.recent_trades && recentTradesTableBody) {
            // requestAnimationFrame not needed here
            updateRecentTradesTable(data.recent_trades);
        }

        // Mise à jour des tendances du marché
        if (data.market_trends && marketTrendsTableBody) {
            // requestAnimationFrame not needed here
            updateMarketTrendsTable(data.market_trends);
        }

        // Mise à jour de l'heure de dernière mise à jour
        if (lastUpdateTimeEl) lastUpdateTimeEl.textContent = new Date().toLocaleTimeString();

        // Mise à jour des badges
        updateBadges(data);
    // } // End of initial if for data change check
}

// Fonction pour mettre à jour les données de performance
function updatePerformanceData(performanceData) {
    if (!performanceData) return;

    // Ne mettre à jour que si les données ont changé (simple check, could be more granular)
    // if (lastData && JSON.stringify(performanceData) === JSON.stringify(lastData.performance)) return; // lastData not used here

    // Mise à jour des métriques principales
    if(roiValueEl) roiValueEl.textContent = performanceData.roi ? performanceData.roi.toFixed(2) : '0.00';
    if(winRateValueEl) winRateValueEl.textContent = performanceData.win_rate ? performanceData.win_rate.toFixed(2) : '0.00';
    if(profitValueEl) {
        profitValueEl.textContent = performanceData.total_profit ? performanceData.total_profit.toFixed(2) : '0.00';
        // Ajouter une classe de profit en fonction de la valeur
        profitValueEl.className = parseFloat(performanceData.total_profit || 0) >= 0 ? 'profit-positive' : 'profit-negative';
    }

    // Mise à jour des détails de performance si différents
    if(performanceWinRateEl) performanceWinRateEl.textContent = `${performanceData.win_rate ? performanceData.win_rate.toFixed(1) : '0.0'}%`;
    if(totalTradesCountEl) totalTradesCountEl.textContent = performanceData.total_trades || 0;
    if(winningTradesCountEl) winningTradesCountEl.textContent = performanceData.winning_trades || 0;
    if(losingTradesCountEl) losingTradesCountEl.textContent = performanceData.losing_trades || 0;
    if(bestWinStreakEl) bestWinStreakEl.textContent = performanceData.winning_streak || 0;
    if(worstLossStreakEl) worstLossStreakEl.textContent = performanceData.losing_streak || 0;
    if(sharpeRatioEl) sharpeRatioEl.textContent = performanceData.sharpe_ratio ? performanceData.sharpe_ratio.toFixed(2) : '0.00';
    if(maxDrawdownEl) maxDrawdownEl.textContent = `${performanceData.drawdown ? performanceData.drawdown.toFixed(2) : '0.00'}%`;
}

// Debounce function pour éviter les appels trop fréquents
function debounce(func, wait, immediate) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

// Mettre à jour le graphique avec debounce pour ne pas surcharger le navigateur
const updateBalanceChartDebounced = debounce(() => {
    if (chartInstances.balanceChart) updateBalanceChart();
    if (chartInstances.portfolioHistoryChart) updatePortfolioHistoryChart();
}, 500); // Reduced debounce time as updates are less frequent now

// Setup system status
function setupSystemStatus() {
    // Ajouter un conteneur pour les statistiques système dans le header
    const topBar = document.querySelector('.top-bar');

    if (topBar && !document.getElementById('systemStatusContainer')) { // Check if already exists
        const systemStatusContainer = document.createElement('div');
        systemStatusContainer.id = 'systemStatusContainer';
        systemStatusContainer.className = 'system-status';
        systemStatusContainer.innerHTML = `
            <div class="status-item">
                <span class="status-label">Uptime:</span>
                <span id="botUptime">0m</span>
            </div>
            <div class="status-item">
                <span class="status-label">CPU:</span>
                <span id="cpuUsage">0%</span>
            </div>
            <div class="status-item">
                <span class="status-label">MEM:</span>
                <span id="memUsage">0 MB</span>
            </div>
        `;

        // Insérer avant les contrôles utilisateur
        const userControls = document.querySelector('.user-controls');
        if (userControls) {
            topBar.insertBefore(systemStatusContainer, userControls);
        } else {
            topBar.appendChild(systemStatusContainer); // Fallback if user-controls not found
        }
    }
}

// Update system status
function updateSystemStatus(data) {
    if (!data) return;

    const botUptimeEl = document.getElementById('botUptime');
    const cpuUsageEl = document.getElementById('cpuUsage');
    const memUsageEl = document.getElementById('memUsage');

    if (botUptimeEl) {
        const uptime = data.uptime || 0;
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);

        botUptimeEl.textContent = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }

    if (cpuUsageEl && data.cpu_usage !== undefined) {
        cpuUsageEl.textContent = `${data.cpu_usage.toFixed(1)}%`;
    }

    if (memUsageEl && data.memory_usage !== undefined) {
        memUsageEl.textContent = `${data.memory_usage.toFixed(0)} MB`;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Start bot button
    if(startBotBtn) startBotBtn.addEventListener('click', () => {
        if (!botRunning) {
            startBot();
        }
    });

    // Stop bot button
    if(stopBotBtn) stopBotBtn.addEventListener('click', () => {
        if (botRunning) {
            stopBot();
        }
    });

    // Refresh button
    if(refreshBtn) refreshBtn.addEventListener('click', () => {
        refreshData();
        refreshBtn.classList.add('rotating');
        setTimeout(() => {
            refreshBtn.classList.remove('rotating');
        }, 1000);
    });

    // Theme toggle
    if(themeToggle) themeToggle.addEventListener('click', () => {
        toggleTheme();
    });

    // Navigation links
    if(sidebarLinks) sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            switchSection(targetId);
        });
    });

    // Symbol and time filters for trade history
    const symbolFilter = document.getElementById('symbolFilter');
    const timeFilter = document.getElementById('timeFilter');

    if (symbolFilter && timeFilter) {
        symbolFilter.addEventListener('change', () => {
            filterTradeHistory();
        });

        timeFilter.addEventListener('change', () => {
            filterTradeHistory();
        });
    }

    // Initialiser et mettre à jour les badges
    // updateBadges(lastData); // lastData might be null initially

    // Ajouter l'événement pour le bouton de rafraîchissement des positions
    const refreshPositionsBtn = document.querySelector('.refresh-positions-btn');
    if (refreshPositionsBtn) {
        refreshPositionsBtn.addEventListener('click', () => {
            refreshPositionsBtn.classList.add('rotating');

            // Ajouter une classe de chargement au tableau
            if (activePositionsTableBody) {
                activePositionsTableBody.classList.add('loading');
            }

            // Récupérer les données
            refreshData() // refreshData now returns a promise
                .then(() => {
                    // Supprimer les classes après la mise à jour
                    setTimeout(() => {
                        refreshPositionsBtn.classList.remove('rotating');
                        if (activePositionsTableBody) {
                            activePositionsTableBody.classList.remove('loading');
                        }
                        createToast('Positions mises à jour', 'Les positions ont été rafraîchies', 'info');
                    }, 1000); // Delay to allow UI to settle
                })
                .catch(() => { // Handle potential errors from refreshData
                     setTimeout(() => {
                        refreshPositionsBtn.classList.remove('rotating');
                        if (activePositionsTableBody) {
                            activePositionsTableBody.classList.remove('loading');
                        }
                    }, 1000);
                });
        });
    }
}

// Check bot status on page load
function checkBotStatus() {
    return new Promise((resolve, reject) => {
        fetch('/api/status')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server responded with status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                updateBotStatus(data.running);

                // Récupérer les données initiales
                return fetch('/api/data');
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server responded with status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Mettre à jour l'interface avec les données initiales
                lastDataHash = JSON.stringify(data); // Set initial hash
                applyDataUpdate(data); // Apply initial data
                resolve(data);
            })
            .catch(error => {
                console.error('Error checking bot status:', error);
                createToast('Error', 'Failed to check bot status', 'error');
                reject(error);
            });
    });
}

// Start the bot
function startBot() {
    fetch('/api/start', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                updateBotStatus(true);
                createToast('Bot Started', 'The trading bot has been started successfully', 'success');
            } else {
                createToast('Error', data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error starting bot:', error);
            createToast('Error', 'Failed to start the bot', 'error');
        });
}

// Stop the bot
function stopBot() {
    fetch('/api/stop', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                updateBotStatus(false);
                createToast('Bot Stopped', 'The trading bot has been stopped successfully', 'info');
            } else {
                createToast('Error', data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error stopping bot:', error);
            createToast('Error', 'Failed to stop the bot', 'error');
        });
}

// Update bot status in UI
function updateBotStatus(running) {
    botRunning = running;

    // Update status indicator
    if(statusIndicator) statusIndicator.style.backgroundColor = running ? 'var(--success-color)' : 'var(--danger-color)';

    // Update status text
    if(botStatusText) botStatusText.textContent = running ? 'Running' : 'Stopped';

    // Update buttons
    if(startBotBtn) startBotBtn.disabled = running;
    if(stopBotBtn) stopBotBtn.disabled = !running;
}

// Refresh data manually
function refreshData() {
    // Return the fetch promise so it can be chained
    return fetch('/api/data')
        .then(response => response.json())
        .then(data => {
            const currentHash = JSON.stringify(data);
            if (currentHash !== lastDataHash) {
                lastDataHash = currentHash;
                applyDataUpdate(data);
            }
        })
        .catch(error => {
            console.error('Error refreshing data:', error);
            createToast('Error', 'Failed to refresh data', 'error');
            throw error; // Re-throw to allow .catch() in caller
        });
}

// Update UI with new data
function updateUI(data) { // This function is now effectively the same as applyDataUpdate
    if (!data || data.status === 'error') {
        console.error('Error in data:', data?.message);
        return;
    }

    // Update bot status
    updateBotStatus(data.status === 'running');

    // Update main metrics
    if(balanceValueEl) balanceValueEl.textContent = data.balance.toFixed(2);

    if (data.performance) {
        // Update performance metrics
        if(roiValueEl) roiValueEl.textContent = data.performance.roi ? data.performance.roi.toFixed(2) : '0.00';
        if(winRateValueEl) winRateValueEl.textContent = data.performance.win_rate ? data.performance.win_rate.toFixed(2) : '0.00';
        if(profitValueEl) {
            profitValueEl.textContent = data.performance.total_profit ? data.performance.total_profit.toFixed(2) : '0.00';
            // Add profit class based on value
            profitValueEl.className = parseFloat(data.performance.total_profit || 0) >= 0 ? 'profit-positive' : 'profit-negative';
        }

        // Update performance details
        if(performanceWinRateEl) performanceWinRateEl.textContent = `${data.performance.win_rate ? data.performance.win_rate.toFixed(1) : '0.0'}%`;
        if(totalTradesCountEl) totalTradesCountEl.textContent = data.performance.total_trades || 0;
        if(winningTradesCountEl) winningTradesCountEl.textContent = data.performance.winning_trades || 0;
        if(losingTradesCountEl) losingTradesCountEl.textContent = data.performance.losing_trades || 0;
        if(bestWinStreakEl) bestWinStreakEl.textContent = data.performance.winning_streak || 0;
        if(worstLossStreakEl) worstLossStreakEl.textContent = data.performance.losing_streak || 0;
        if(sharpeRatioEl) sharpeRatioEl.textContent = data.performance.sharpe_ratio ? data.performance.sharpe_ratio.toFixed(2) : '0.00';
        if(maxDrawdownEl) maxDrawdownEl.textContent = `${data.performance.drawdown ? data.performance.drawdown.toFixed(2) : '0.00'}%`;
    }

    // Update portfolio summary
    if(initialBalanceValueEl) initialBalanceValueEl.textContent = `${data.initial_balance ? data.initial_balance.toFixed(2) : '0.00'} USDT`;
    if(currentBalanceValueEl) currentBalanceValueEl.textContent = `${data.balance ? data.balance.toFixed(2) : '0.00'} USDT`;
    if(totalProfitValueEl) totalProfitValueEl.textContent = `${data.performance?.total_profit ? data.performance.total_profit.toFixed(2) : '0.00'} USDT`;
    if(activePositionsCountEl) activePositionsCountEl.textContent = data.positions ? data.positions.length : 0;

    // Update ROI in portfolio section
    if(portfolioROIEl) portfolioROIEl.textContent = `${data.performance?.roi ? data.performance.roi.toFixed(2) : '0.00'}%`;

    // Add balance to history for chart
    if (data.balance) {
        const now = new Date();
        balanceHistory.push({
            time: now,
            balance: data.balance
        });

        // Keep only the last 100 data points
        if (balanceHistory.length > 100) {
            balanceHistory.shift();
        }

        // Update balance chart
        updateBalanceChartDebounced(); // Uses debounced version
    }

    // Update active positions table
    updatePositionsTable(data.positions || []);

    // Update recent trades table
    updateRecentTradesTable(data.recent_trades || []);

    // Update market trends table
    updateMarketTrendsTable(data.market_trends || []);

    // Update trading pairs in settings
    updateTradingPairsGrid(data.market_trends || []);

    // Update last update time
    if(lastUpdateTimeEl) lastUpdateTimeEl.textContent = new Date().toLocaleTimeString();
}

// Update active positions table
function updatePositionsTable(positions) {
    if (!activePositionsTableBody) return; // Guard clause if element not found

    const rowsToRemove = new Set();
    activePositionsTableBody.querySelectorAll('tr[data-symbol]').forEach(row => {
        rowsToRemove.add(row.dataset.symbol);
    });

    positions.forEach(position => {
        rowsToRemove.delete(position.symbol); // Position still exists, don't remove

        let pnlValue = 0;
        let pnlClass = '';
        if (position.current_price) {
            pnlValue = (position.direction.toUpperCase() === 'LONG' ?
                ((position.current_price - position.entry_price) / position.entry_price) :
                ((position.entry_price - position.current_price) / position.entry_price)
            ) * 100 * position.leverage;
            pnlClass = pnlValue >= 0 ? 'profit-positive' : 'profit-negative';
        }

        let entryTime = new Date(position.entry_time);
        let currentTime = new Date();
        let elapsedMinutes = Math.floor((currentTime - entryTime) / (1000 * 60));
        let timeDisplay = elapsedMinutes < 60 ?
            `${elapsedMinutes}m` :
            `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}m`;

        let existingRow = activePositionsTableBody.querySelector(`tr[data-symbol="${position.symbol}"]`);

        if (existingRow) { // Update existing row
            const cells = existingRow.cells;
            cells[2].textContent = position.entry_price.toFixed(4); // Entry Price
            cells[3].textContent = position.current_price ? position.current_price.toFixed(4) : '-'; // Current Price

            const pnlCell = cells[4];
            const oldPnlText = pnlCell.textContent;
            const newPnlText = position.current_price ? pnlValue.toFixed(2) + '%' : '-';
            if (oldPnlText !== newPnlText) {
                pnlCell.textContent = newPnlText;
                pnlCell.className = pnlClass; // Update class for color
                 // Apply pulse animation only if PnL changed significantly
                const oldPnlValue = parseFloat(oldPnlText);
                if (!isNaN(oldPnlValue) && Math.abs(pnlValue - oldPnlValue) > 0.01 && !pendingAnimations.has(position.symbol)) {
                    existingRow.classList.add(pnlValue > oldPnlValue ? 'pulse-profit' : 'pulse-loss');
                    pendingAnimations.add(position.symbol);
                    setTimeout(() => {
                        existingRow.classList.remove('pulse-profit', 'pulse-loss');
                        pendingAnimations.delete(position.symbol);
                    }, 2000); // Animation duration
                }
            }

            cells[5].textContent = `${position.leverage}x`; // Leverage
            cells[6].textContent = position.stop_loss ? position.stop_loss.toFixed(4) : '-'; // SL
            cells[7].textContent = position.take_profit ? position.take_profit.toFixed(4) : '-'; // TP
            cells[8].innerHTML = `${formatTime(position.entry_time)} <span class="elapsed-time">(${timeDisplay})</span>`; // Entry Time
        } else { // Add new row
            const newRow = activePositionsTableBody.insertRow();
            newRow.dataset.symbol = position.symbol;
            newRow.innerHTML = `
                <td><span class="symbol-text">${position.symbol.replace('/USDT:USDT', '')}</span></td>
                <td><span class="direction-label direction-${position.direction.toLowerCase()}">${position.direction}</span></td>
                <td>${position.entry_price.toFixed(4)}</td>
                <td>${position.current_price ? position.current_price.toFixed(4) : '-'}</td>
                <td class="${pnlClass}">${position.current_price ? pnlValue.toFixed(2) + '%' : '-'}</td>
                <td>${position.leverage}x</td>
                <td>${position.stop_loss ? position.stop_loss.toFixed(4) : '-'}</td>
                <td>${position.take_profit ? position.take_profit.toFixed(4) : '-'}</td>
                <td>${formatTime(position.entry_time)} <span class="elapsed-time">(${timeDisplay})</span></td>
                <td>
                    <button class="btn btn-sm btn-danger close-position-btn" data-symbol="${position.symbol}">
                        <i class="fas fa-times"></i> Close
                    </button>
                </td>
            `;
            // Add event listener for the new close button
            newRow.querySelector('.close-position-btn').addEventListener('click', (e) => {
                e.preventDefault();
                closePosition(position.symbol);
            });
        }
    });

    // Remove old rows
    rowsToRemove.forEach(symbol => {
        const rowToRemove = activePositionsTableBody.querySelector(`tr[data-symbol="${symbol}"]`);
        if (rowToRemove) {
            // Optional: Add fade-out animation
            rowToRemove.style.transition = 'opacity 0.3s ease-out';
            rowToRemove.style.opacity = '0';
            setTimeout(() => rowToRemove.remove(), 300);
        }
    });

    if (activePositionsTableBody.rows.length === 0) {
        activePositionsTableBody.innerHTML = '<tr class="no-data"><td colspan="10">No active positions</td></tr>';
    } else {
        const noDataRow = activePositionsTableBody.querySelector('.no-data');
        if (noDataRow) noDataRow.remove();
    }

    // Re-attach event listeners for close buttons if rows were rebuilt (though we are trying to avoid full rebuild)
    // This is now handled per new row. If full rebuild was used, it would be:
    // document.querySelectorAll('#activePositionsTable .close-position-btn').forEach(btn => { ... });
}


// Function to close a position manually
function closePosition(symbol) {
    if (!symbol) return;

    // Trouver l'élément de la position et ajouter une classe de chargement
    const positionRow = activePositionsTableBody ? activePositionsTableBody.querySelector(`tr[data-symbol="${symbol}"]`) : null;
    if (positionRow) {
        positionRow.classList.add('loading');

        // Désactiver le bouton de fermeture pendant la requête
        const closeBtn = positionRow.querySelector('.close-position-btn');
        if (closeBtn) {
            closeBtn.disabled = true;
            closeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Closing...';
        }
    }

    createToast('Closing Position', `Closing position for ${symbol}...`, 'info');

    fetch('/api/close_position', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ symbol: symbol })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.status === 'success') {
            // Animer la suppression de la ligne
            if (positionRow) {
                positionRow.style.transition = 'all 0.5s ease';
                positionRow.style.backgroundColor = 'rgba(0, 184, 148, 0.1)';
                positionRow.style.transform = 'translateX(20px)';
                positionRow.style.opacity = '0';

                setTimeout(() => {
                    positionRow.remove();

                    // Vérifier s'il reste des positions
                    if (activePositionsTableBody && activePositionsTableBody.querySelectorAll('tr[data-symbol]').length === 0) {
                        activePositionsTableBody.innerHTML = '<tr class="no-data"><td colspan="10">No active positions</td></tr>';
                    }
                }, 500);
            }

            createToast('Position Closed', `Successfully closed position for ${symbol}`, 'success');

            // Retirer cette position du cache
            positionsCache.delete(symbol);

            // Rafraîchir les données pour mettre à jour l'interface
            refreshData();
        } else {
            // Restaurer le bouton si la fermeture échoue
            if (positionRow) {
                positionRow.classList.remove('loading');

                const closeBtn = positionRow.querySelector('.close-position-btn');
                if (closeBtn) {
                    closeBtn.disabled = false;
                    closeBtn.innerHTML = '<i class="fas fa-times"></i> Close';

                    // Effet d'animation pour montrer l'échec
                    closeBtn.classList.add('btn-shake');
                    setTimeout(() => {
                        closeBtn.classList.remove('btn-shake');
                    }, 500);
                }
            }

            createToast('Error', data.message || 'Failed to close position', 'error');
        }
    })
    .catch(error => {
        console.error('Error closing position:', error);

        // Restaurer le bouton en cas d'erreur
        if (positionRow) {
            positionRow.classList.remove('loading');

            const closeBtn = positionRow.querySelector('.close-position-btn');
            if (closeBtn) {
                closeBtn.disabled = false;
                closeBtn.innerHTML = '<i class="fas fa-times"></i> Close';

                // Effet d'animation pour montrer l'échec
                closeBtn.classList.add('btn-shake');
                setTimeout(() => {
                    closeBtn.classList.remove('btn-shake');
                }, 500);
            }
        }

        createToast('Error', 'Failed to close position: Network error', 'error');
    });
}

// Update recent trades table
function updateRecentTradesTable(trades) {
    if (!recentTradesTableBody) return;
    requestAnimationFrame(() => {
        if (trades.length > 0) {
            recentTradesTableBody.innerHTML = trades.slice(0, 5).map(trade => `
                <tr>
                    <td>${trade.symbol}</td>
                    <td>${formatAction(trade.action)}</td>
                    <td>${trade.entry_price.toFixed(4)} / ${trade.exit_price.toFixed(4)}</td>
                    <td class="${trade.profit >= 0 ? 'profit-positive' : 'profit-negative'}">${trade.profit.toFixed(2)} (${trade.profit_percent.toFixed(2)}%)</td>
                    <td>${trade.duration.toFixed(1)} min</td>
                </tr>
            `).join('');
        } else {
            recentTradesTableBody.innerHTML = '<tr class="no-data"><td colspan="5">No recent trades</td></tr>';
        }
    });

    if (tradeHistoryTableBody) { // Updated to use cached selector
        requestAnimationFrame(() => {
            if (trades.length > 0) {
                updateTradeHistoryFilters(trades);
                updateTradeHistoryStats(trades);
                tradeHistoryTableBody.innerHTML = trades.map(trade => `
                    <tr data-symbol="${trade.symbol}" data-date="${new Date(trade.exit_time).toISOString().split('T')[0]}">
                        <td>${trade.symbol}</td>
                        <td>${getDirectionFromAction(trade.action)}</td>
                        <td>${trade.entry_price.toFixed(4)}</td>
                        <td>${trade.exit_price.toFixed(4)}</td>
                        <td class="${trade.profit >= 0 ? 'profit-positive' : 'profit-negative'}">${trade.profit.toFixed(2)}</td>
                        <td class="${trade.profit_percent >= 0 ? 'profit-positive' : 'profit-negative'}">${trade.profit_percent.toFixed(2)}%</td>
                        <td>${trade.leverage}x</td>
                        <td>${formatDateTime(trade.entry_time)}</td>
                        <td>${formatDateTime(trade.exit_time)}</td>
                        <td>${trade.duration.toFixed(1)} min</td>
                    </tr>
                `).join('');
            } else {
                tradeHistoryTableBody.innerHTML = '<tr class="no-data"><td colspan="10">No trade history available</td></tr>';
            }
        });
    }
}

// Update market trends table
function updateMarketTrendsTable(trends) {
    if (!marketTrendsTableBody) return;
    requestAnimationFrame(() => {
        if (trends.length > 0) {
            marketTrendsTableBody.innerHTML = trends.map(trend => `
                <tr>
                    <td>${trend.symbol}</td>
                    <td class="${getTrendClass(trend.trend_1m)}">${trend.trend_1m}</td>
                    <td class="${getTrendClass(trend.trend_5m)}">${trend.trend_5m}</td>
                    <td class="${getTrendClass(trend.trend_15m)}">${trend.trend_15m}</td>
                    <td class="${getTrendClass(trend.trend_1h)}">${trend.trend_1h}</td>
                    <td class="${getAlignmentClass(trend.alignment)}">${trend.alignment}</td>
                    <td>${trend.volatility ? trend.volatility.toFixed(2) : '0.00'}%</td>
                    <td><div class="signal-strength-bar" style="width: ${(trend.signal_strength * 100).toFixed(0)}%;"></div></td>
                </tr>
            `).join('');

            // Add CSS for signal strength bars (ensure this is only added once or managed better)
            if (!document.getElementById('signal-strength-style')) {
                const style = document.createElement('style');
                style.id = 'signal-strength-style';
                style.textContent = `
                    .signal-strength-bar {
                        height: 6px;
                        background-color: var(--primary-color);
                        border-radius: 3px;
                        max-width: 100%;
                    }
                `;
                document.head.appendChild(style);
            }
        } else {
            marketTrendsTableBody.innerHTML = '<tr class="no-data"><td colspan="8">No market data available</td></tr>';
        }
    });
}

// Update trading pairs grid in settings
function updateTradingPairsGrid(trends) {
    const tradingPairsGrid = document.getElementById('tradingPairsGrid');

    if (tradingPairsGrid && trends.length > 0) {
        tradingPairsGrid.innerHTML = trends.map(trend => `
            <div class="pair-item">
                <div class="symbol">${trend.symbol.replace('/USDT:USDT', '')}</div>
                <div class="score">Score: ${trend.signal_strength ? (trend.signal_strength * 10).toFixed(1) : '0.0'}</div>
            </div>
        `).join('');
    }
}

// Setup charts
function setupCharts() {
    // Balance Chart
    setupBalanceChart();

    // Portfolio History Chart
    setupPortfolioHistoryChart();
}

// Setup balance chart
function setupBalanceChart() {
    if (!balanceChartEl) return;
    const ctx = balanceChartEl.getContext('2d');
    chartInstances.balanceChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Balance', data: [], borderColor: 'rgba(112, 87, 255, 1)', backgroundColor: 'rgba(112, 87, 255, 0.1)', borderWidth: 2, fill: true, tension: 0.4 }] },
        options: chartOptions() // Use shared options
    });
}

// Update balance chart
function updateBalanceChart() {
    if (chartInstances.balanceChart && balanceHistory.length > 0) {
        const labels = balanceHistory.map(item => item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        const data = balanceHistory.map(item => item.balance);
        chartInstances.balanceChart.data.labels = labels;
        chartInstances.balanceChart.data.datasets[0].data = data;
        chartInstances.balanceChart.update('none'); // 'none' for no animation during live updates
    }
}

// Setup portfolio history chart
function setupPortfolioHistoryChart() {
    if (!portfolioHistoryChartEl) return;
    const ctx = portfolioHistoryChartEl.getContext('2d');
    chartInstances.portfolioHistoryChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Balance', data: [], borderColor: 'rgba(112, 87, 255, 1)', backgroundColor: 'rgba(112, 87, 255, 0.1)', borderWidth: 2, fill: true, tension: 0.4 }] },
        options: chartOptions(true) // Extended options for portfolio
    });
    updatePortfolioHistoryChart(); // Initial population
}

// Update portfolio history chart
function updatePortfolioHistoryChart() {
    if (chartInstances.portfolioHistoryChart && balanceHistory.length > 0) {
        const labels = balanceHistory.map(item => item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        const data = balanceHistory.map(item => item.balance);
        chartInstances.portfolioHistoryChart.data.labels = labels;
        chartInstances.portfolioHistoryChart.data.datasets[0].data = data;
        chartInstances.portfolioHistoryChart.update('none');
    }
}

// Shared chart options function
function chartOptions(isPortfolioChart = false) {
    const baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { mode: 'index', intersect: false, callbacks: { label: context => `Balance: ${context.raw.toFixed(2)} USDT` } }
        },
        scales: {
            x: { display: true, grid: { display: false }, ticks: { maxTicksLimit: isPortfolioChart ? 10 : 6, maxRotation: 0, color: themeMode === 'dark' ? '#adb5bd' : '#495057' } },
            y: { display: true, grid: { color: themeMode === 'dark' ? 'rgba(200, 200, 200, 0.1)' : 'rgba(0, 0, 0, 0.1)' }, ticks: { callback: value => value.toFixed(2), color: themeMode === 'dark' ? '#adb5bd' : '#495057' } }
        }
    };
    return baseOptions;
}


// Update trade history filters
function updateTradeHistoryFilters(trades) {
    const symbolFilter = document.getElementById('symbolFilter');

    if (symbolFilter) {
        const currentSelectedSymbol = symbolFilter.value;
        // Get unique symbols
        const symbols = [...new Set(trades.map(trade => trade.symbol))];

        // Keep the "All Symbols" option
        let options = '<option value="all">All Symbols</option>';

        // Add option for each symbol
        symbols.forEach(symbol => {
            options += `<option value="${symbol}" ${symbol === currentSelectedSymbol ? 'selected' : ''}>${symbol}</option>`;
        });

        symbolFilter.innerHTML = options;
    }
}

// Update trade history stats
function updateTradeHistoryStats(trades) {
    const historyTotalTradesEl = document.getElementById('historyTotalTrades');
    const historyWinRateEl = document.getElementById('historyWinRate');
    const historyTotalProfitEl = document.getElementById('historyTotalProfit');
    const historyAvgTradeEl = document.getElementById('historyAvgTrade');

    if (historyTotalTradesEl && historyWinRateEl && historyTotalProfitEl && historyAvgTradeEl) {
        // Calculate stats
        const totalTrades = trades.length;
        const winningTrades = trades.filter(trade => trade.profit > 0).length;
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
        const totalProfit = trades.reduce((sum, trade) => sum + trade.profit, 0);
        const avgTrade = totalTrades > 0 ? totalProfit / totalTrades : 0;

        // Update UI
        historyTotalTradesEl.textContent = totalTrades;
        historyWinRateEl.textContent = `${winRate.toFixed(1)}%`;
        historyTotalProfitEl.textContent = `${totalProfit.toFixed(2)} USDT`;
        historyAvgTradeEl.textContent = `${avgTrade.toFixed(2)} USDT`;

        // Add classes for positive/negative
        historyTotalProfitEl.className = `value ${totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}`;
        historyAvgTradeEl.className = `value ${avgTrade >= 0 ? 'profit-positive' : 'profit-negative'}`;
    }
}

// Filter trade history
function filterTradeHistory() {
    const symbolFilter = document.getElementById('symbolFilter');
    const timeFilter = document.getElementById('timeFilter');
    // const tradeHistoryTableBody = document.getElementById('tradeHistoryTable')?.querySelector('tbody'); // Already cached

    if (symbolFilter && timeFilter && tradeHistoryTableBody) {
        const selectedSymbol = symbolFilter.value;
        const selectedTime = timeFilter.value;

        // Get all trade rows
        const rows = tradeHistoryTableBody.querySelectorAll('tr:not(.no-data)');
        let visibleRowCount = 0;

        // Filter rows
        rows.forEach(row => {
            const rowSymbol = row.getAttribute('data-symbol');
            const rowDate = row.getAttribute('data-date');

            let showRow = true;

            // Filter by symbol
            if (selectedSymbol !== 'all' && rowSymbol !== selectedSymbol) {
                showRow = false;
            }

            // Filter by time
            if (showRow && selectedTime !== 'all') {
                const now = new Date();
                const tradeDate = new Date(rowDate);

                if (selectedTime === 'today') {
                    // Check if date is today
                    if (tradeDate.toDateString() !== now.toDateString()) {
                        showRow = false;
                    }
                } else if (selectedTime === 'week') {
                    // Check if date is within the last 7 days
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);

                    if (tradeDate < weekAgo) {
                        showRow = false;
                    }
                } else if (selectedTime === 'month') {
                    // Check if date is within the last 30 days
                    const monthAgo = new Date();
                    monthAgo.setDate(monthAgo.getDate() - 30);

                    if (tradeDate < monthAgo) {
                        showRow = false;
                    }
                }
            }

            // Show or hide row
            row.style.display = showRow ? '' : 'none';
            if (showRow) visibleRowCount++;
        });

        // Check if no rows are visible
        const noDataFilteredRow = tradeHistoryTableBody.querySelector('.no-data-filtered');
        if (visibleRowCount === 0) {
            if (!noDataFilteredRow) {
                const newNoDataRow = tradeHistoryTableBody.insertRow();
                newNoDataRow.className = 'no-data no-data-filtered';
                newNoDataRow.innerHTML = '<td colspan="10">No trades match the selected filters</td>';
            }
        } else {
            if (noDataFilteredRow) {
                noDataFilteredRow.remove();
            }
        }
    }
}

// Switch between sections
function switchSection(sectionId) {
    // Hide all sections
    if(sections) sections.forEach(section => {
        section.classList.remove('active');
    });

    // Show the selected section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // Update active link in sidebar
    if(sidebarLinks) sidebarLinks.forEach(link => {
        link.parentElement.classList.remove('active');

        if (link.getAttribute('href') === `#${sectionId}`) {
            link.parentElement.classList.add('active');
        }
    });

    // Update charts if needed
    if (sectionId === 'portfolio' && chartInstances.portfolioHistoryChart) {
        updatePortfolioHistoryChart();
    } else if (sectionId === 'dashboard' && chartInstances.balanceChart) {
        updateBalanceChart();
    }
}

// Toggle theme between light and dark
function toggleTheme() {
    themeMode = themeMode === 'dark' ? 'light' : 'dark';

    // Apply theme
    applyTheme(themeMode);

    // Save to local storage
    localStorage.setItem('theme', themeMode);
}

// Apply theme
function applyTheme(theme) {
    const root = document.documentElement;

    if (theme === 'dark') {
        root.style.setProperty('--background', 'var(--dark-bg)');
        root.style.setProperty('--card-bg', 'var(--dark-card-bg)');
        root.style.setProperty('--text-color', 'var(--dark-text)');
        root.style.setProperty('--heading-color', 'var(--dark-heading)');
        root.style.setProperty('--border-color', 'var(--dark-border)');

        if(themeToggle) themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    } else {
        root.style.setProperty('--background', 'var(--light-bg)');
        root.style.setProperty('--card-bg', 'var(--light-card-bg)');
        root.style.setProperty('--text-color', 'var(--light-text)');
        root.style.setProperty('--heading-color', 'var(--light-heading)');
        root.style.setProperty('--border-color', 'var(--light-border)');

        if(themeToggle) themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }

    // Update charts to match theme
    updateChartsTheme(theme);
}

// Update charts to match theme
function updateChartsTheme(theme) {
    const textColor = theme === 'dark' ? '#adb5bd' : '#495057'; // Using refined theme colors
    const gridColor = theme === 'dark' ? 'rgba(200, 200, 200, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    // Update all chart instances
    Object.values(chartInstances).forEach(chart => {
        if (chart && chart.options && chart.options.scales) {
            // Update text color
            if(chart.options.scales.x) chart.options.scales.x.ticks.color = textColor;
            if(chart.options.scales.y) chart.options.scales.y.ticks.color = textColor;

            // Update grid color
            if(chart.options.scales.y) chart.options.scales.y.grid.color = gridColor;

            // Update the chart
            chart.update();
        }
    });
}

// Load theme from local storage
function loadTheme() {
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme) {
        themeMode = savedTheme;
    } // else defaults to 'dark' as set globally
    applyTheme(themeMode);
}

// Create toast notification
function createToast(title, message, type = 'info') {
    // Vérifier si le conteneur de toasts existe, sinon le créer
    let toastContainer = document.getElementById('toastContainer');

    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    // Limiter le nombre de toasts à 4 en même temps
    const existingToasts = toastContainer.querySelectorAll('.toast');
    if (existingToasts.length >= 4) {
        // Supprimer le toast le plus ancien
        existingToasts[0].remove();
    }

    // Créer un ID unique pour ce toast
    const toastId = 'toast-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

    // Obtenir la couleur en fonction du type
    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-check-circle';
    else if (type === 'error') iconClass = 'fa-exclamation-circle';
    else if (type === 'warning') iconClass = 'fa-exclamation-triangle';

    // Créer l'élément toast avec une animation améliorée
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.id = toastId;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');

    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas ${iconClass}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
            <div class="toast-progress">
                <div class="toast-progress-bar"></div>
            </div>
        </div>
        <button class="toast-close" aria-label="Close notification">
            <i class="fas fa-times"></i>
        </button>
    `;

    // Ajouter le toast au conteneur
    toastContainer.appendChild(toast);

    // Afficher avec une animation d'entrée
    requestAnimationFrame(() => {
        toast.classList.add('show');

        // Animer la barre de progression
        const progressBar = toast.querySelector('.toast-progress-bar');
        if (progressBar) {
            progressBar.style.width = '100%'; // Ensure it starts at 100% before transition
            requestAnimationFrame(() => { // Next frame to apply transition
                 progressBar.style.transition = 'width 5s linear';
                 progressBar.style.width = '0%';
            });
        }
    });

    // Ajouter les écouteurs d'événements
    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeToast(toast);
        });
    }

    // Fermer automatiquement après 5 secondes
    const autoCloseTimeout = setTimeout(() => {
        closeToast(toast);
    }, 5000);

    // Pause le compte à rebours si le toast est survolé
    toast.addEventListener('mouseenter', () => {
        clearTimeout(autoCloseTimeout);
        // Mettre en pause l'animation de la barre de progression
        const progressBar = toast.querySelector('.toast-progress-bar');
        if (progressBar) {
            const computedWidth = window.getComputedStyle(progressBar).width;
            progressBar.style.transition = 'none'; // Stop animation
            progressBar.style.width = computedWidth; // Hold current width
        }
    });

    // Reprendre le compte à rebours quand la souris quitte
    toast.addEventListener('mouseleave', () => {
        const progressBar = toast.querySelector('.toast-progress-bar');
        if (progressBar) {
            const currentWidthPercent = (parseFloat(window.getComputedStyle(progressBar).width) / toast.querySelector('.toast-progress').offsetWidth) * 100;
            const remainingTime = 5000 * (currentWidthPercent / 100);

            progressBar.style.transition = `width ${remainingTime / 1000}s linear`;
            progressBar.style.width = '0%';

            setTimeout(() => {
                closeToast(toast);
            }, remainingTime);
        }
    });

    return toastId;
}

// Fonction pour fermer un toast avec animation
function closeToast(toast) {
    if (!toast || !toast.classList.contains('show')) return; // Already closing or closed

    // Ajouter une classe pour l'animation de sortie
    toast.classList.remove('show'); // Ensure show is removed if re-triggered quickly
    toast.classList.add('hiding');

    // Supprimer après la fin de l'animation
    toast.addEventListener('transitionend', () => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, { once: true }); // Ensure event listener is removed after firing
}

// Helper functions
function formatTime(timeString) {
    if (!timeString) return '';

    const date = new Date(timeString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(timeString) {
    if (!timeString) return '';

    const date = new Date(timeString);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatAction(action) {
    if (!action) return '';

    if (action.includes('ouverture_long')) return 'Open Long';
    if (action.includes('ouverture_short')) return 'Open Short';
    if (action.includes('fermeture_long')) return 'Close Long';
    if (action.includes('fermeture_short')) return 'Close Short';

    return action;
}

function getDirectionFromAction(action) {
    if (!action) return '';

    if (action.includes('long')) return 'Long';
    if (action.includes('short')) return 'Short';

    return '';
}

function getTrendClass(trend) {
    if (!trend) return '';

    if (trend.toLowerCase() === 'haussière') return 'profit-positive';
    if (trend.toLowerCase() === 'baissière') return 'profit-negative';

    return '';
}

function getAlignmentClass(alignment) {
    if (typeof alignment !== 'number') return '';

    if (alignment > 0) return 'profit-positive';
    if (alignment < 0) return 'profit-negative';

    return '';
}

// Initialiser et mettre à jour les badges
function updateBadges(data) {
    if (!tradesCountBadgeEl) return;

    if (data && data.recent_trades && data.recent_trades.length > 0) {
        // Afficher le nombre de trades récents
        tradesCountBadgeEl.textContent = data.recent_trades.length;
        tradesCountBadgeEl.style.display = 'inline-flex';
    } else {
        // Masquer le badge s'il n'y a pas de trades récents
        tradesCountBadgeEl.style.display = 'none';
    }
}
        animationFrameRequested = false;
        return;
    }
    
    const now = performance.now();
    while (animationQueue.length > 0) {
        const animation = animationQueue.shift();
        try {
            animation.callback();
        } catch (err) {
            console.error('Animation error:', err);
        }
        
        // Éviter de bloquer le thread trop longtemps
        if (performance.now() - now > 16) { // ~60fps
            break;
        }
    }
    
    if (animationQueue.length > 0) {
        requestAnimationFrame(processAnimationQueue);
    } else {
        animationFrameRequested = false;
    }
}

// Fonction pour ajouter une animation à la file d'attente
function queueAnimation(callback, priority = 0) {
    animationQueue.push({ callback, priority });
    animationQueue.sort((a, b) => b.priority - a.priority);
    
    if (!animationFrameRequested) {
        animationFrameRequested = true;
        requestAnimationFrame(processAnimationQueue);
    }
}

// Fonction pour ajouter des classes d'animation aux éléments
function animateElement(element, className, duration = 1000) {
    if (!element) return;
    
    element.classList.add(className);
    setTimeout(() => {
        element.classList.remove(className);
    }, duration);
}

// Fonction pour animer les changements de valeur
function animateValue(element, start, end, duration = 1000, prefix = '', suffix = '') {
    if (!element) return;
    
    // Si les valeurs sont déjà égales, pas besoin d'animation
    if (start === end) {
        element.textContent = prefix + end.toFixed(2) + suffix;
        return;
    }
    
    // Marquer l'élément comme animé
    element.classList.add('animated-value');
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = easeOutCubic(progress);
        const currentValue = start + easeProgress * (end - start);
        element.textContent = prefix + currentValue.toFixed(2) + suffix;
        
        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            // Animation terminée, retirer la classe
            setTimeout(() => {
                element.classList.remove('animated-value');
            }, 200);
        }
    };
    
    requestAnimationFrame(step);
}

// Fonction d'easing pour les animations
function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Afficher un indicateur de chargement initial
    showLoadingOverlay();
    
    // Connect to Socket.IO server
    initializeSocketConnection();
    
    // Setup event listeners
    setupEventListeners();
    
    // Check bot status
    checkBotStatus()
        .then(() => {
            // Setup charts une fois le statut récupéré
            setupCharts();
            
            // Load theme from local storage
            loadTheme();
            
            // Mise en place de l'état du système
            setupSystemStatus();
            
            // Cacher l'overlay une fois tout chargé
            hideLoadingOverlay();
            
            // Vérifier la santé du bot périodiquement
            setInterval(checkBotHealth, 30000);
        })
        .catch(error => {
            console.error('Error initializing app:', error);
            hideLoadingOverlay();
            createToast('Erreur', 'Impossible de se connecter au serveur', 'error');
        });
        
    // Ajouter des tooltips aux éléments qui ont un attribut data-tooltip
    addTooltipsToElements();
});

// Fonction pour ajouter des tooltips aux éléments
function addTooltipsToElements() {
    const tooltipElements = document.querySelectorAll('[data-tooltip]');
    tooltipElements.forEach(element => {
        // Les tooltips sont gérés en CSS, rien à faire ici
        // Cette fonction est extensible pour des tooltips plus complexes
    });
}

// Fonction pour afficher un overlay de chargement
function showLoadingOverlay() {
    // Créer l'overlay s'il n'existe pas déjà
    if (!document.getElementById('loadingOverlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-text">Chargement de l'interface...</div>
        `;
        document.body.appendChild(overlay);
        
        // Ajouter les styles si nécessaire
        if (!document.getElementById('loadingOverlayStyles')) {
            const style = document.createElement('style');
            style.id = 'loadingOverlayStyles';
            style.textContent = `
                .loading-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(16, 21, 45, 0.9);
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    z-index: 9999;
                    transition: opacity 0.5s ease;
                }
                .loading-spinner {
                    width: 50px;
                    height: 50px;
                    border: 3px solid rgba(0, 0, 0, 0.1);
                    border-radius: 50%;
                    border-top-color: var(--primary-color);
                    animation: spin 1s ease-in-out infinite;
                }
                .loading-text {
                    margin-top: 20px;
                    color: var(--dark-heading);
                    font-size: 1.2rem;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }
}

// Fonction pour cacher l'overlay de chargement
function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
        }, 500);
    }
}

// Nouvelle fonction pour vérifier la santé du bot
function checkBotHealth() {
    fetch('/api/system_status')
        .then(response => response.json())
        .then(data => {
            // Mettre à jour les indicateurs de santé du bot
            if (data.bot_status === 'running') {
                updateSystemStatus(data);
            } else if (botRunning) {
                // Le bot est censé être en cours d'exécution mais il ne répond pas
                createToast('Attention', 'Le bot semble ne plus répondre', 'warning');
            }
        })
        .catch(error => {
            console.error('Erreur lors de la vérification de la santé du bot:', error);
            if (botRunning) {
                createToast('Problème de connexion', 'Impossible de contacter le serveur', 'error');
            }
        });
}

// Initialize Socket.IO connection
function initializeSocketConnection() {
    socket = io({
        reconnectionDelay: reconnectDelay,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: maxConnectionAttempts,
        timeout: 10000
    });
    
    socket.on('connect', () => {
        console.log('Connected to server');
        createToast('Connecté', 'Connexion établie avec le serveur', 'success');
        socket.emit('start_background_task');
        
        // Réinitialiser les variables de reconnexion
        connectionAttempts = 0;
        reconnectDelay = 2000;
        
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        
        // Vérifier l'état du bot après reconnexion
        checkBotStatus();
    });
    
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        connectionAttempts++;
        
        // Si nous avons atteint le nombre maximal de tentatives, notifier l'utilisateur
        if (connectionAttempts >= maxConnectionAttempts) {
            createToast('Problème de connexion', 'Impossible de se connecter au serveur. Veuillez rafraîchir la page.', 'error');
            
            // Tenter une reconnexion après un délai plus long
            if (!reconnectTimer) {
                reconnectTimer = setTimeout(() => {
                    // Augmenter le délai pour les tentatives suivantes (backoff exponentiel)
                    reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
                    socket.io.opts.reconnectionDelay = reconnectDelay;
                    socket.io.opts.reconnectionAttempts = maxConnectionAttempts;
                    
                    // Réessayer de se connecter
                    socket.connect();
                    reconnectTimer = null;
                }, reconnectDelay);
            }
        }
    });
    
    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        
        if (reason === 'io server disconnect') {
            // La déconnexion a été initiée par le serveur, nous devons nous reconnecter manuellement
            createToast('Déconnecté', 'Connexion perdue, tentative de reconnexion...', 'warning');
            socket.connect();
        } else if (reason === 'transport close' || reason === 'ping timeout') {
            // Problème réseau, les tentatives de reconnexion automatiques seront effectuées
            createToast('Connexion instable', 'Tentative de reconnexion...', 'warning');
        } else {
            createToast('Déconnecté', 'Connexion au serveur perdue', 'error');
        }
    });
    
    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`Tentative de reconnexion #${attemptNumber}`);
        document.body.classList.add('connection-issue');
    });
    
    socket.on('reconnect', (attemptNumber) => {
        console.log(`Reconnecté après ${attemptNumber} tentatives`);
        document.body.classList.remove('connection-issue');
        createToast('Reconnecté', 'Connexion rétablie avec le serveur', 'success');
    });
    
    socket.on('data_update', (data) => {
        if (data) {
            document.body.classList.remove('connection-issue');
            
            const startTime = performance.now();
            
            // Mise à jour optimisée de l'interface
            applyDataUpdate(data);
            lastData = data;
            lastDataTimestamp = data.timestamp || Date.now();
            
            // Mesurer la performance de la mise à jour
            const updateDuration = performance.now() - startTime;
            performanceMetrics.lastUpdateDuration = updateDuration;
            performanceMetrics.updatesCount++;
            performanceMetrics.averageUpdateTime = 
                (performanceMetrics.averageUpdateTime * (performanceMetrics.updatesCount - 1) + updateDuration) / 
                performanceMetrics.updatesCount;
            
            // Log des performances si elles dépassent un seuil
            if (updateDuration > 100) {
                console.warn(`Mise à jour lente: ${updateDuration.toFixed(2)}ms`);
            }
        }
    });
    
    // Gestion des pings - pour éviter les mises à jour inutiles
    socket.on('data_ping', (data) => {
        document.body.classList.remove('connection-issue');
        
        // Vérification si nous avons déjà des données fraîches
        if (data.timestamp && (!lastDataTimestamp || data.timestamp > lastDataTimestamp)) {
            refreshData(); // Récupérer les données complètes si notre cache est obsolète
        }
    });
    
    // Notification d'état du bot
    socket.on('bot_status', (data) => {
        if (data && data.status) {
            updateBotStatus(data.status === 'running');
        }
    });
    
    // Ajouter des styles pour les problèmes de connexion
    if (!document.getElementById('connection-issue-style')) {
        const style = document.createElement('style');
        style.id = 'connection-issue-style';
        style.textContent = `
            .connection-issue::after {
                content: 'Connexion perdue, tentative de reconnexion...';
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                padding: 10px;
                background-color: var(--danger-color);
                color: white;
                text-align: center;
                font-weight: 500;
                z-index: 9999;
                transform: translateY(-100%);
                animation: slideDown 0.3s forwards;
            }
            
            @keyframes slideDown {
                to { transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }
}

// Fonction pour appliquer intelligemment les mises à jour
function applyDataUpdate(data) {
    // Ne mettez à jour l'interface que si les données ont changé
    if (!lastData || JSON.stringify(data) !== JSON.stringify(lastData)) {
        if (data.status) {
            updateBotStatus(data.status === 'running');
        }
        
        // Mise à jour des métriques principales
        if (data.balance !== undefined) {
            balanceValue.textContent = data.balance.toFixed(2);
            
            // Ajouter à l'historique pour le graphique avec un timestamp
            const now = new Date();
            balanceHistory.push({
                time: now,
                balance: data.balance
            });
            
            // Garder seulement les 100 derniers points
            if (balanceHistory.length > 100) {
                balanceHistory.shift();
            }
            
            // Mettre à jour le graphique avec débounce pour éviter les ralentissements
            updateBalanceChartDebounced();
        }
        
        // Mise à jour des performances
        updatePerformanceData(data.performance);
        
        // Mise à jour des positions avec animation
        if (data.positions) {
            requestAnimationFrame(() => {
                updatePositionsTable(data.positions);
            });
        }
        
        // Mise à jour des trades récents
        if (data.recent_trades) {
            requestAnimationFrame(() => {
                updateRecentTradesTable(data.recent_trades);
            });
        }
        
        // Mise à jour des tendances du marché
        if (data.market_trends) {
            requestAnimationFrame(() => {
                updateMarketTrendsTable(data.market_trends);
            });
        }
        
        // Mise à jour de l'heure de dernière mise à jour
        lastUpdateTime.textContent = new Date().toLocaleTimeString();
        
        // Mise à jour des badges
        updateBadges(data);
    }
}

// Fonction pour mettre à jour les données de performance
function updatePerformanceData(performanceData) {
    if (!performanceData) return;
    
    // Ne mettre à jour que si les données ont changé
    if (lastData && JSON.stringify(performanceData) === JSON.stringify(lastData.performance)) return;
    
    // Mise à jour des métriques principales
    roiValue.textContent = performanceData.roi ? performanceData.roi.toFixed(2) : '0.00';
    winRateValue.textContent = performanceData.win_rate ? performanceData.win_rate.toFixed(2) : '0.00';
    profitValue.textContent = performanceData.total_profit ? performanceData.total_profit.toFixed(2) : '0.00';
    
    // Ajouter une classe de profit en fonction de la valeur
    profitValue.className = parseFloat(performanceData.total_profit || 0) >= 0 ? 'profit-positive' : 'profit-negative';
    
    // Mise à jour des détails de performance si différents
    document.getElementById('performanceWinRate').textContent = `${performanceData.win_rate ? performanceData.win_rate.toFixed(1) : '0.0'}%`;
    document.getElementById('totalTradesCount').textContent = performanceData.total_trades || 0;
    document.getElementById('winningTradesCount').textContent = performanceData.winning_trades || 0;
    document.getElementById('losingTradesCount').textContent = performanceData.losing_trades || 0;
    document.getElementById('bestWinStreak').textContent = performanceData.winning_streak || 0;
    document.getElementById('worstLossStreak').textContent = performanceData.losing_streak || 0;
    document.getElementById('sharpeRatio').textContent = performanceData.sharpe_ratio ? performanceData.sharpe_ratio.toFixed(2) : '0.00';
    document.getElementById('maxDrawdown').textContent = `${performanceData.drawdown ? performanceData.drawdown.toFixed(2) : '0.00'}%`;
}

// Debounce function pour éviter les appels trop fréquents
function debounce(func, wait, immediate) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

// Mettre à jour le graphique avec debounce pour ne pas surcharger le navigateur
const updateBalanceChartDebounced = debounce(() => {
    updateBalanceChart();
    updatePortfolioHistoryChart();
}, 1000);

// Setup system status
function setupSystemStatus() {
    // Ajouter un conteneur pour les statistiques système dans le header
    const topBar = document.querySelector('.top-bar');
    
    if (topBar) {
        const systemStatus = document.createElement('div');
        systemStatus.className = 'system-status';
        systemStatus.innerHTML = `
            <div class="status-item">
                <span class="status-label">Uptime:</span>
                <span id="botUptime">0m</span>
            </div>
            <div class="status-item">
                <span class="status-label">CPU:</span>
                <span id="cpuUsage">0%</span>
            </div>
            <div class="status-item">
                <span class="status-label">MEM:</span>
                <span id="memUsage">0 MB</span>
            </div>
        `;
        
        // Insérer avant les contrôles utilisateur
        topBar.insertBefore(systemStatus, document.querySelector('.user-controls'));
    }
}

// Update system status
function updateSystemStatus(data) {
    if (!data) return;
    
    const botUptimeEl = document.getElementById('botUptime');
    const cpuUsageEl = document.getElementById('cpuUsage');
    const memUsageEl = document.getElementById('memUsage');
    
    if (botUptimeEl) {
        const uptime = data.uptime || 0;
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        
        botUptimeEl.textContent = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }
    
    if (cpuUsageEl && data.cpu_usage !== undefined) {
        cpuUsageEl.textContent = `${data.cpu_usage.toFixed(1)}%`;
    }
    
    if (memUsageEl && data.memory_usage !== undefined) {
        memUsageEl.textContent = `${data.memory_usage.toFixed(0)} MB`;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Start bot button
    startBotBtn.addEventListener('click', () => {
        if (!botRunning) {
            startBot();
        }
    });
    
    // Stop bot button
    stopBotBtn.addEventListener('click', () => {
        if (botRunning) {
            stopBot();
        }
    });
    
    // Refresh button
    refreshBtn.addEventListener('click', () => {
        refreshData();
        refreshBtn.classList.add('rotating');
        setTimeout(() => {
            refreshBtn.classList.remove('rotating');
        }, 1000);
    });
    
    // Theme toggle
    themeToggle.addEventListener('click', () => {
        toggleTheme();
    });
    
    // Navigation links
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            switchSection(targetId);
        });
    });
    
    // Symbol and time filters for trade history
    const symbolFilter = document.getElementById('symbolFilter');
    const timeFilter = document.getElementById('timeFilter');
    
    if (symbolFilter && timeFilter) {
        symbolFilter.addEventListener('change', () => {
            filterTradeHistory();
        });
        
        timeFilter.addEventListener('change', () => {
            filterTradeHistory();
        });
    }
    
    // Initialiser et mettre à jour les badges
    updateBadges(lastData);
    
    // Ajouter l'événement pour le bouton de rafraîchissement des positions
    const refreshPositionsBtn = document.querySelector('.refresh-positions-btn');
    if (refreshPositionsBtn) {
        refreshPositionsBtn.addEventListener('click', () => {
            refreshPositionsBtn.classList.add('rotating');
            
            // Ajouter une classe de chargement au tableau
            const positionsTable = document.getElementById('activePositionsTable');
            if (positionsTable) {
                positionsTable.classList.add('loading');
            }
            
            // Récupérer les données
            refreshData()
                .then(() => {
                    // Supprimer les classes après la mise à jour
                    setTimeout(() => {
                        refreshPositionsBtn.classList.remove('rotating');
                        if (positionsTable) {
                            positionsTable.classList.remove('loading');
                        }
                        createToast('Positions mises à jour', 'Les positions ont été rafraîchies', 'info');
                    }, 1000);
                });
        });
    }
}

// Check bot status on page load
function checkBotStatus() {
    return new Promise((resolve, reject) => {
        fetch('/api/status')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server responded with status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                updateBotStatus(data.running);
                
                // Récupérer les données initiales
                return fetch('/api/data');
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server responded with status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Mettre à jour l'interface avec les données initiales
                updateUI(data);
                resolve(data);
            })
            .catch(error => {
                console.error('Error checking bot status:', error);
                createToast('Error', 'Failed to check bot status', 'error');
                reject(error);
            });
    });
}

// Start the bot
function startBot() {
    fetch('/api/start', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                updateBotStatus(true);
                createToast('Bot Started', 'The trading bot has been started successfully', 'success');
            } else {
                createToast('Error', data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error starting bot:', error);
            createToast('Error', 'Failed to start the bot', 'error');
        });
}

// Stop the bot
function stopBot() {
    fetch('/api/stop', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                updateBotStatus(false);
                createToast('Bot Stopped', 'The trading bot has been stopped successfully', 'info');
            } else {
                createToast('Error', data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error stopping bot:', error);
            createToast('Error', 'Failed to stop the bot', 'error');
        });
}

// Update bot status in UI
function updateBotStatus(running) {
    botRunning = running;
    
    // Update status indicator
    statusIndicator.style.backgroundColor = running ? 'var(--success-color)' : 'var(--danger-color)';
    
    // Update status text
    botStatusText.textContent = running ? 'Running' : 'Stopped';
    
    // Update buttons
    startBotBtn.disabled = running;
    stopBotBtn.disabled = !running;
}

// Refresh data manually
function refreshData() {
    fetch('/api/data')
        .then(response => response.json())
        .then(data => {
            updateUI(data);
            lastData = data;
        })
        .catch(error => {
            console.error('Error refreshing data:', error);
            createToast('Error', 'Failed to refresh data', 'error');
        });
}

// Update UI with new data
function updateUI(data) {
    if (!data || data.status === 'error') {
        console.error('Error in data:', data?.message);
        return;
    }
    
    // Update bot status
    updateBotStatus(data.status === 'running');
    
    // Update main metrics
    balanceValue.textContent = data.balance.toFixed(2);
    
    if (data.performance) {
        // Update performance metrics
        roiValue.textContent = data.performance.roi ? data.performance.roi.toFixed(2) : '0.00';
        winRateValue.textContent = data.performance.win_rate ? data.performance.win_rate.toFixed(2) : '0.00';
        profitValue.textContent = data.performance.total_profit ? data.performance.total_profit.toFixed(2) : '0.00';
        
        // Add profit class based on value
        profitValue.className = parseFloat(data.performance.total_profit || 0) >= 0 ? 'profit-positive' : 'profit-negative';
        
        // Update performance details
        document.getElementById('performanceWinRate').textContent = `${data.performance.win_rate ? data.performance.win_rate.toFixed(1) : '0.0'}%`;
        document.getElementById('totalTradesCount').textContent = data.performance.total_trades || 0;
        document.getElementById('winningTradesCount').textContent = data.performance.winning_trades || 0;
        document.getElementById('losingTradesCount').textContent = data.performance.losing_trades || 0;
        document.getElementById('bestWinStreak').textContent = data.performance.winning_streak || 0;
        document.getElementById('worstLossStreak').textContent = data.performance.losing_streak || 0;
        document.getElementById('sharpeRatio').textContent = data.performance.sharpe_ratio ? data.performance.sharpe_ratio.toFixed(2) : '0.00';
        document.getElementById('maxDrawdown').textContent = `${data.performance.drawdown ? data.performance.drawdown.toFixed(2) : '0.00'}%`;
    }
    
    // Update portfolio summary
    document.getElementById('initialBalanceValue').textContent = `${data.initial_balance ? data.initial_balance.toFixed(2) : '0.00'} USDT`;
    document.getElementById('currentBalanceValue').textContent = `${data.balance ? data.balance.toFixed(2) : '0.00'} USDT`;
    document.getElementById('totalProfitValue').textContent = `${data.performance?.total_profit ? data.performance.total_profit.toFixed(2) : '0.00'} USDT`;
    document.getElementById('activePositionsCount').textContent = data.positions ? data.positions.length : 0;
    
    // Update ROI in portfolio section
    document.getElementById('portfolioROI').textContent = `${data.performance?.roi ? data.performance.roi.toFixed(2) : '0.00'}%`;
    
    // Add balance to history for chart
    if (data.balance) {
        const now = new Date();
        balanceHistory.push({
            time: now,
            balance: data.balance
        });
        
        // Keep only the last 100 data points
        if (balanceHistory.length > 100) {
            balanceHistory.shift();
        }
        
        // Update balance chart
        updateBalanceChart();
    }
    
    // Update active positions table
    updatePositionsTable(data.positions || []);
    
    // Update recent trades table
    updateRecentTradesTable(data.recent_trades || []);
    
    // Update market trends table
    updateMarketTrendsTable(data.market_trends || []);
    
    // Update trading pairs in settings
    updateTradingPairsGrid(data.market_trends || []);
    
    // Update last update time
    lastUpdateTime.textContent = new Date().toLocaleTimeString();
}

// Update active positions table
function updatePositionsTable(positions) {
    const activePositionsTable = document.getElementById('activePositionsTable');
    const allPositionsTable = document.getElementById('allPositionsTable');
    
    // Store previous PnL values to compare for animation
    let previousPnlValues = {};
    
    // Get previous PnL values from existing table rows and update position cache
    if (activePositionsTable) {
        document.querySelectorAll('#activePositionsTable tr[data-symbol]').forEach(row => {
            const symbol = row.getAttribute('data-symbol');
            const pnlCell = row.querySelector('td:nth-child(5)');
            if (pnlCell) {
                // Extract numeric value from PnL cell
                const pnlText = pnlCell.textContent;
                const pnlValue = parseFloat(pnlText);
                if (!isNaN(pnlValue)) {
                    previousPnlValues[symbol] = pnlValue;
                }
            }
        });
    }
    
    // Process positions for efficient updates
    const currentSymbols = new Set(positions.map(p => p.symbol));
    const cachedSymbols = new Set([...positionsCache.keys()]);
    
    // Positions à supprimer (dans le cache mais plus dans les données actuelles)
    const symbolsToRemove = new Set([...cachedSymbols].filter(x => !currentSymbols.has(x)));
    
    // Mettre à jour le cache
    positions.forEach(position => {
        positionsCache.set(position.symbol, position);
    });
    
    // Supprimer les positions fermées du cache
    symbolsToRemove.forEach(symbol => {
        positionsCache.delete(symbol);
    });
    
    if (activePositionsTable) {
        if (positions.length > 0) {
            // Optimiser la mise à jour du DOM
            const fragment = document.createDocumentFragment();
            
            positions.forEach(position => {
                // Calculate PnL if current_price is available
                let pnlValue = 0;
                let pnlClass = '';
                let rowClass = '';
                
                if (position.current_price) {
                    // Calculate PnL based on direction
                    if (position.direction.toUpperCase() === 'LONG') {
                        pnlValue = ((position.current_price - position.entry_price) / position.entry_price) * 100 * position.leverage;
                    } else {
                        pnlValue = ((position.entry_price - position.current_price) / position.entry_price) * 100 * position.leverage;
                    }
                    
                    pnlClass = pnlValue >= 0 ? 'profit-positive' : 'profit-negative';
                    
                    // Check if PnL changed significantly for animation
                    const previousPnl = previousPnlValues[position.symbol];
                    if (previousPnl !== undefined) {
                        const pnlChange = pnlValue - previousPnl;
                        
                        // Add animation class if PnL changed by more than 1%
                        if (Math.abs(pnlChange) > 1 && !pendingAnimations.has(position.symbol)) {
                            rowClass = pnlChange > 0 ? 'pulse-profit' : 'pulse-loss';
                            pendingAnimations.add(position.symbol);
                            
                            // Retirer l'animation après un délai
                            setTimeout(() => {
                                pendingAnimations.delete(position.symbol);
                                
                                // Retirer la classe d'animation du row si elle existe encore
                                const row = document.querySelector(`tr[data-symbol="${position.symbol}"]`);
                                if (row) {
                                    row.classList.remove('pulse-profit', 'pulse-loss');
                                }
                            }, 3000);
                        }
                    }
                }
                
                // Calculate time elapsed since position opened
                let entryTime = new Date(position.entry_time);
                let currentTime = new Date();
                let elapsedMinutes = Math.floor((currentTime - entryTime) / (1000 * 60));
                let timeDisplay = elapsedMinutes < 60 ? 
                    `${elapsedMinutes}m` : 
                    `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}m`;
                
                // Vérifier si la ligne existe déjà
                const existingRow = document.querySelector(`tr[data-symbol="${position.symbol}"]`);
                
                if (existingRow) {
                    // Mise à jour des valeurs de la ligne existante sans recréer tout le DOM
                    const cells = existingRow.querySelectorAll('td');
                    
                    // Mettre à jour le prix actuel et le PnL qui peuvent changer
                    if (cells[3]) cells[3].textContent = position.current_price ? position.current_price.toFixed(4) : '-';
                    
                    if (cells[4]) {
                        cells[4].textContent = position.current_price ? pnlValue.toFixed(2) + '%' : '-';
                        cells[4].className = pnlClass;
                    }
                    
                    // Mettre à jour le temps écoulé
                    if (cells[8]) {
                        const timeSpan = cells[8].querySelector('.elapsed-time');
                        if (timeSpan) timeSpan.textContent = `(${timeDisplay})`;
                    }
                    
                    // Appliquer la classe d'animation si nécessaire
                    if (rowClass) {
                        existingRow.classList.add(rowClass);
                    }
                } else {
                    // Créer une nouvelle ligne
                    const newRow = document.createElement('tr');
                    newRow.setAttribute('data-symbol', position.symbol);
                    if (rowClass) newRow.classList.add(rowClass);
                    
                    newRow.innerHTML = `
                        <td><span class="symbol-text">${position.symbol.replace('/USDT:USDT', '')}</span></td>
                        <td><span class="direction-label direction-${position.direction.toLowerCase()}">${position.direction}</span></td>
                        <td>${position.entry_price.toFixed(4)}</td>
                        <td>${position.current_price ? position.current_price.toFixed(4) : '-'}</td>
                        <td class="${pnlClass}">${position.current_price ? pnlValue.toFixed(2) + '%' : '-'}</td>
                        <td>${position.leverage}x</td>
                        <td>${position.stop_loss ? position.stop_loss.toFixed(4) : '-'}</td>
                        <td>${position.take_profit ? position.take_profit.toFixed(4) : '-'}</td>
                        <td>${formatTime(position.entry_time)} <span class="elapsed-time">(${timeDisplay})</span></td>
                        <td>
                            <button class="btn btn-sm btn-danger close-position-btn" data-symbol="${position.symbol}">
                                <i class="fas fa-times"></i> Close
                            </button>
                        </td>
                    `;
                    
                    fragment.appendChild(newRow);
                }
            });
            
            // Ajouter les nouvelles lignes au tableau
            if (fragment.childNodes.length > 0) {
                activePositionsTable.appendChild(fragment);
            }
            
            // Supprimer les lignes qui ne sont plus dans les positions actuelles
            document.querySelectorAll('#activePositionsTable tr[data-symbol]').forEach(row => {
                const symbol = row.getAttribute('data-symbol');
                if (!currentSymbols.has(symbol)) {
                    // Animer la suppression
                    row.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                    row.style.opacity = '0';
                    row.style.transform = 'translateX(20px)';
                    
                    setTimeout(() => {
                        row.remove();
                        
                        // Si toutes les positions sont fermées, afficher le message "No active positions"
                        if (activePositionsTable.querySelectorAll('tr[data-symbol]').length === 0) {
                            activePositionsTable.innerHTML = '<tr class="no-data"><td colspan="10">No active positions</td></tr>';
                        }
                    }, 500);
                }
            });
            
            // Supprimer le message "No active positions" s'il y a des positions
            const noDataRow = activePositionsTable.querySelector('.no-data');
            if (noDataRow && positions.length > 0) {
                noDataRow.remove();
            }
            
            // Add event listeners to close position buttons
            document.querySelectorAll('.close-position-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const symbol = btn.getAttribute('data-symbol');
                    closePosition(symbol);
                });
            });
        } else {
            activePositionsTable.innerHTML = '<tr class="no-data"><td colspan="10">No active positions</td></tr>';
        }
    }
    
    if (allPositionsTable) {
        if (positions.length > 0) {
            allPositionsTable.innerHTML = positions.map(position => {
                // Calculate PnL if current_price is available
                let pnlValue = 0;
                let pnlClass = '';
                
                if (position.current_price) {
                    // Calculate PnL based on direction
                    if (position.direction === 'LONG') {
                        pnlValue = ((position.current_price - position.entry_price) / position.entry_price) * 100 * position.leverage;
                    } else {
                        pnlValue = ((position.entry_price - position.current_price) / position.entry_price) * 100 * position.leverage;
                    }
                    
                    pnlClass = pnlValue >= 0 ? 'profit-positive' : 'profit-negative';
                }
                
                return `
                <tr>
                    <td>${position.symbol}</td>
                    <td><span class="direction-label direction-${position.direction.toLowerCase()}">${position.direction}</span></td>
                    <td>${position.entry_price.toFixed(4)}</td>
                    <td>${position.current_price ? position.current_price.toFixed(4) : '-'}</td>
                    <td>${position.leverage}x</td>
                    <td>${position.quantity.toFixed(6)}</td>
                    <td class="${pnlClass}">${position.current_price ? pnlValue.toFixed(2) + '%' : '-'}</td>
                    <td>${position.stop_loss ? position.stop_loss.toFixed(4) : '-'}</td>
                    <td>${position.take_profit ? position.take_profit.toFixed(4) : '-'}</td>
                    <td>${formatTime(position.entry_time)}</td>
                </tr>
            `}).join('');
        } else {
            allPositionsTable.innerHTML = '<tr class="no-data"><td colspan="10">No positions</td></tr>';
        }
    }
}

// Function to close a position manually
function closePosition(symbol) {
    if (!symbol) return;
    
    // Trouver l'élément de la position et ajouter une classe de chargement
    const positionRow = document.querySelector(`tr[data-symbol="${symbol}"]`);
    if (positionRow) {
        positionRow.classList.add('loading');
        
        // Désactiver le bouton de fermeture pendant la requête
        const closeBtn = positionRow.querySelector('.close-position-btn');
        if (closeBtn) {
            closeBtn.disabled = true;
            closeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Closing...';
        }
    }
    
    createToast('Closing Position', `Closing position for ${symbol}...`, 'info');
    
    fetch('/api/close_position', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ symbol: symbol })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.status === 'success') {
            // Animer la suppression de la ligne
            if (positionRow) {
                positionRow.style.transition = 'all 0.5s ease';
                positionRow.style.backgroundColor = 'rgba(0, 184, 148, 0.1)';
                positionRow.style.transform = 'translateX(20px)';
                positionRow.style.opacity = '0';
                
                setTimeout(() => {
                    positionRow.remove();
                    
                    // Vérifier s'il reste des positions
                    const activePositionsTable = document.getElementById('activePositionsTable');
                    if (activePositionsTable && activePositionsTable.querySelectorAll('tr[data-symbol]').length === 0) {
                        activePositionsTable.innerHTML = '<tr class="no-data"><td colspan="10">No active positions</td></tr>';
                    }
                }, 500);
            }
            
            createToast('Position Closed', `Successfully closed position for ${symbol}`, 'success');
            
            // Retirer cette position du cache
            positionsCache.delete(symbol);
            
            // Rafraîchir les données pour mettre à jour l'interface
            refreshData();
        } else {
            // Restaurer le bouton si la fermeture échoue
            if (positionRow) {
                positionRow.classList.remove('loading');
                
                if (closeBtn) {
                    closeBtn.disabled = false;
                    closeBtn.innerHTML = '<i class="fas fa-times"></i> Close';
                    
                    // Effet d'animation pour montrer l'échec
                    closeBtn.classList.add('btn-shake');
                    setTimeout(() => {
                        closeBtn.classList.remove('btn-shake');
                    }, 500);
                }
            }
            
            createToast('Error', data.message || 'Failed to close position', 'error');
        }
    })
    .catch(error => {
        console.error('Error closing position:', error);
        
        // Restaurer le bouton en cas d'erreur
        if (positionRow) {
            positionRow.classList.remove('loading');
            
            if (closeBtn) {
                closeBtn.disabled = false;
                closeBtn.innerHTML = '<i class="fas fa-times"></i> Close';
                
                // Effet d'animation pour montrer l'échec
                closeBtn.classList.add('btn-shake');
                setTimeout(() => {
                    closeBtn.classList.remove('btn-shake');
                }, 500);
            }
        }
        
        createToast('Error', 'Failed to close position: Network error', 'error');
    });
}

// Update recent trades table
function updateRecentTradesTable(trades) {
    const recentTradesTable = document.getElementById('recentTradesTable');
    const tradeHistoryTable = document.getElementById('tradeHistoryTable');
    
    if (recentTradesTable) {
        if (trades.length > 0) {
            recentTradesTable.innerHTML = trades.slice(0, 5).map(trade => `
                <tr>
                    <td>${trade.symbol}</td>
                    <td>${formatAction(trade.action)}</td>
                    <td>${trade.entry_price.toFixed(4)} / ${trade.exit_price.toFixed(4)}</td>
                    <td class="${trade.profit >= 0 ? 'profit-positive' : 'profit-negative'}">${trade.profit.toFixed(2)} (${trade.profit_percent.toFixed(2)}%)</td>
                    <td>${trade.duration.toFixed(1)} min</td>
                </tr>
            `).join('');
        } else {
            recentTradesTable.innerHTML = '<tr class="no-data"><td colspan="5">No recent trades</td></tr>';
        }
    }
    
    if (tradeHistoryTable) {
        if (trades.length > 0) {
            // Update trade history filters
            updateTradeHistoryFilters(trades);
            
            // Update trade history stats
            updateTradeHistoryStats(trades);
            
            // Update trade history table
            tradeHistoryTable.innerHTML = trades.map(trade => `
                <tr data-symbol="${trade.symbol}" data-date="${new Date(trade.exit_time).toISOString().split('T')[0]}">
                    <td>${trade.symbol}</td>
                    <td>${getDirectionFromAction(trade.action)}</td>
                    <td>${trade.entry_price.toFixed(4)}</td>
                    <td>${trade.exit_price.toFixed(4)}</td>
                    <td class="${trade.profit >= 0 ? 'profit-positive' : 'profit-negative'}">${trade.profit.toFixed(2)}</td>
                    <td class="${trade.profit_percent >= 0 ? 'profit-positive' : 'profit-negative'}">${trade.profit_percent.toFixed(2)}%</td>
                    <td>${trade.leverage}x</td>
                    <td>${formatDateTime(trade.entry_time)}</td>
                    <td>${formatDateTime(trade.exit_time)}</td>
                    <td>${trade.duration.toFixed(1)} min</td>
                </tr>
            `).join('');
        } else {
            tradeHistoryTable.innerHTML = '<tr class="no-data"><td colspan="10">No trade history available</td></tr>';
        }
    }
}

// Update market trends table
function updateMarketTrendsTable(trends) {
    const marketTrendsTable = document.getElementById('marketTrendsTable');
    
    if (marketTrendsTable) {
        if (trends.length > 0) {
            marketTrendsTable.innerHTML = trends.map(trend => `
                <tr>
                    <td>${trend.symbol}</td>
                    <td class="${getTrendClass(trend.trend_1m)}">${trend.trend_1m}</td>
                    <td class="${getTrendClass(trend.trend_5m)}">${trend.trend_5m}</td>
                    <td class="${getTrendClass(trend.trend_15m)}">${trend.trend_15m}</td>
                    <td class="${getTrendClass(trend.trend_1h)}">${trend.trend_1h}</td>
                    <td class="${getAlignmentClass(trend.alignment)}">${trend.alignment}</td>
                    <td>${trend.volatility ? trend.volatility.toFixed(2) : '0.00'}%</td>
                    <td><div class="signal-strength-bar" style="width: ${(trend.signal_strength * 100).toFixed(0)}%;"></div></td>
                </tr>
            `).join('');
            
            // Add CSS for signal strength bars
            if (!document.getElementById('signal-strength-style')) {
                const style = document.createElement('style');
                style.id = 'signal-strength-style';
                style.textContent = `
                    .signal-strength-bar {
                        height: 6px;
                        background-color: var(--primary-color);
                        border-radius: 3px;
                        max-width: 100%;
                    }
                `;
                document.head.appendChild(style);
            }
        } else {
            marketTrendsTable.innerHTML = '<tr class="no-data"><td colspan="8">No market data available</td></tr>';
        }
    }
}

// Update trading pairs grid in settings
function updateTradingPairsGrid(trends) {
    const tradingPairsGrid = document.getElementById('tradingPairsGrid');
    
    if (tradingPairsGrid && trends.length > 0) {
        tradingPairsGrid.innerHTML = trends.map(trend => `
            <div class="pair-item">
                <div class="symbol">${trend.symbol.replace('/USDT:USDT', '')}</div>
                <div class="score">Score: ${trend.signal_strength ? (trend.signal_strength * 10).toFixed(1) : '0.0'}</div>
            </div>
        `).join('');
    }
}

// Setup charts
function setupCharts() {
    // Balance Chart
    setupBalanceChart();
    
    // Portfolio History Chart
    setupPortfolioHistoryChart();
}

// Setup balance chart
function setupBalanceChart() {
    const balanceChartEl = document.getElementById('balanceChart');
    
    if (balanceChartEl) {
        const ctx = balanceChartEl.getContext('2d');
        
        chartInstances.balanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Balance',
                    data: [],
                    borderColor: 'rgba(115, 103, 240, 1)',
                    backgroundColor: 'rgba(115, 103, 240, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return `Balance: ${context.raw.toFixed(2)} USDT`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            display: false
                        },
                        ticks: {
                            maxTicksLimit: 6,
                            maxRotation: 0
                        }
                    },
                    y: {
                        display: true,
                        grid: {
                            color: 'rgba(200, 200, 200, 0.1)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
    }
}

// Update balance chart
function updateBalanceChart() {
    if (chartInstances.balanceChart && balanceHistory.length > 0) {
        // Format labels for time
        const labels = balanceHistory.map(item => {
            return item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        });
        
        // Get balance data
        const data = balanceHistory.map(item => item.balance);
        
        // Update chart
        chartInstances.balanceChart.data.labels = labels;
        chartInstances.balanceChart.data.datasets[0].data = data;
        chartInstances.balanceChart.update();
    }
}

// Setup portfolio history chart
function setupPortfolioHistoryChart() {
    const portfolioHistoryChartEl = document.getElementById('portfolioHistoryChart');
    
    if (portfolioHistoryChartEl) {
        const ctx = portfolioHistoryChartEl.getContext('2d');
        
        chartInstances.portfolioHistoryChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Balance',
                    data: [],
                    borderColor: 'rgba(115, 103, 240, 1)',
                    backgroundColor: 'rgba(115, 103, 240, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return `Balance: ${context.raw.toFixed(2)} USDT`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            display: false
                        },
                        ticks: {
                            maxTicksLimit: 10,
                            maxRotation: 0
                        }
                    },
                    y: {
                        display: true,
                        grid: {
                            color: 'rgba(200, 200, 200, 0.1)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
        
        // Use the same data as balance chart for now
        updatePortfolioHistoryChart();
    }
}

// Update portfolio history chart
function updatePortfolioHistoryChart() {
    if (chartInstances.portfolioHistoryChart && balanceHistory.length > 0) {
        // Format labels for time
        const labels = balanceHistory.map(item => {
            return item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        });
        
        // Get balance data
        const data = balanceHistory.map(item => item.balance);
        
        // Update chart
        chartInstances.portfolioHistoryChart.data.labels = labels;
        chartInstances.portfolioHistoryChart.data.datasets[0].data = data;
        chartInstances.portfolioHistoryChart.update();
    }
}

// Update trade history filters
function updateTradeHistoryFilters(trades) {
    const symbolFilter = document.getElementById('symbolFilter');
    
    if (symbolFilter) {
        // Get unique symbols
        const symbols = [...new Set(trades.map(trade => trade.symbol))];
        
        // Keep the "All Symbols" option
        let options = '<option value="all">All Symbols</option>';
        
        // Add option for each symbol
        symbols.forEach(symbol => {
            options += `<option value="${symbol}">${symbol}</option>`;
        });
        
        symbolFilter.innerHTML = options;
    }
}

// Update trade history stats
function updateTradeHistoryStats(trades) {
    const historyTotalTrades = document.getElementById('historyTotalTrades');
    const historyWinRate = document.getElementById('historyWinRate');
    const historyTotalProfit = document.getElementById('historyTotalProfit');
    const historyAvgTrade = document.getElementById('historyAvgTrade');
    
    if (historyTotalTrades && historyWinRate && historyTotalProfit && historyAvgTrade) {
        // Calculate stats
        const totalTrades = trades.length;
        const winningTrades = trades.filter(trade => trade.profit > 0).length;
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
        const totalProfit = trades.reduce((sum, trade) => sum + trade.profit, 0);
        const avgTrade = totalTrades > 0 ? totalProfit / totalTrades : 0;
        
        // Update UI
        historyTotalTrades.textContent = totalTrades;
        historyWinRate.textContent = `${winRate.toFixed(1)}%`;
        historyTotalProfit.textContent = `${totalProfit.toFixed(2)} USDT`;
        historyAvgTrade.textContent = `${avgTrade.toFixed(2)} USDT`;
        
        // Add classes for positive/negative
        historyTotalProfit.className = totalProfit >= 0 ? 'value profit-positive' : 'value profit-negative';
        historyAvgTrade.className = avgTrade >= 0 ? 'value profit-positive' : 'value profit-negative';
    }
}

// Filter trade history
function filterTradeHistory() {
    const symbolFilter = document.getElementById('symbolFilter');
    const timeFilter = document.getElementById('timeFilter');
    const tradeHistoryTable = document.getElementById('tradeHistoryTable');
    
    if (symbolFilter && timeFilter && tradeHistoryTable) {
        const selectedSymbol = symbolFilter.value;
        const selectedTime = timeFilter.value;
        
        // Get all trade rows
        const rows = tradeHistoryTable.querySelectorAll('tr:not(.no-data)');
        
        // Filter rows
        rows.forEach(row => {
            const rowSymbol = row.getAttribute('data-symbol');
            const rowDate = row.getAttribute('data-date');
            
            let showRow = true;
            
            // Filter by symbol
            if (selectedSymbol !== 'all' && rowSymbol !== selectedSymbol) {
                showRow = false;
            }
            
            // Filter by time
            if (showRow && selectedTime !== 'all') {
                const now = new Date();
                const tradeDate = new Date(rowDate);
                
                if (selectedTime === 'today') {
                    // Check if date is today
                    if (tradeDate.toDateString() !== now.toDateString()) {
                        showRow = false;
                    }
                } else if (selectedTime === 'week') {
                    // Check if date is within the last 7 days
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    
                    if (tradeDate < weekAgo) {
                        showRow = false;
                    }
                } else if (selectedTime === 'month') {
                    // Check if date is within the last 30 days
                    const monthAgo = new Date();
                    monthAgo.setDate(monthAgo.getDate() - 30);
                    
                    if (tradeDate < monthAgo) {
                        showRow = false;
                    }
                }
            }
            
            // Show or hide row
            row.style.display = showRow ? '' : 'none';
        });
        
        // Check if no rows are visible
        let visibleRows = Array.from(rows).filter(row => row.style.display !== 'none');
        
        if (visibleRows.length === 0) {
            if (!tradeHistoryTable.querySelector('.no-data-filtered')) {
                const noDataRow = document.createElement('tr');
                noDataRow.className = 'no-data no-data-filtered';
                noDataRow.innerHTML = '<td colspan="10">No trades match the selected filters</td>';
                tradeHistoryTable.appendChild(noDataRow);
            }
        } else {
            const noDataRow = tradeHistoryTable.querySelector('.no-data-filtered');
            if (noDataRow) {
                noDataRow.remove();
            }
        }
    }
}

// Switch between sections
function switchSection(sectionId) {
    // Hide all sections
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    // Show the selected section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Update active link in sidebar
    sidebarLinks.forEach(link => {
        link.parentElement.classList.remove('active');
        
        if (link.getAttribute('href') === `#${sectionId}`) {
            link.parentElement.classList.add('active');
        }
    });
    
    // Update charts if needed
    if (sectionId === 'portfolio') {
        updatePortfolioHistoryChart();
    }
}

// Toggle theme between light and dark
function toggleTheme() {
    themeMode = themeMode === 'dark' ? 'light' : 'dark';
    
    // Apply theme
    applyTheme(themeMode);
    
    // Save to local storage
    localStorage.setItem('theme', themeMode);
}

// Apply theme
function applyTheme(theme) {
    const root = document.documentElement;
    
    if (theme === 'dark') {
        root.style.setProperty('--background', 'var(--dark-bg)');
        root.style.setProperty('--card-bg', 'var(--dark-card-bg)');
        root.style.setProperty('--text-color', 'var(--dark-text)');
        root.style.setProperty('--heading-color', 'var(--dark-heading)');
        root.style.setProperty('--border-color', 'var(--dark-border)');
        
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    } else {
        root.style.setProperty('--background', 'var(--light-bg)');
        root.style.setProperty('--card-bg', 'var(--light-card-bg)');
        root.style.setProperty('--text-color', 'var(--light-text)');
        root.style.setProperty('--heading-color', 'var(--light-heading)');
        root.style.setProperty('--border-color', 'var(--light-border)');
        
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
    
    // Update charts to match theme
    updateChartsTheme(theme);
}

// Update charts to match theme
function updateChartsTheme(theme) {
    const textColor = theme === 'dark' ? '#b4b7bd' : '#5e5873';
    const gridColor = theme === 'dark' ? 'rgba(200, 200, 200, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    
    // Update all chart instances
    Object.values(chartInstances).forEach(chart => {
        if (chart) {
            // Update text color
            chart.options.scales.x.ticks.color = textColor;
            chart.options.scales.y.ticks.color = textColor;
            
            // Update grid color
            chart.options.scales.y.grid.color = gridColor;
            
            // Update the chart
            chart.update();
        }
    });
}

// Load theme from local storage
function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    
    if (savedTheme) {
        themeMode = savedTheme;
        applyTheme(themeMode);
    }
}

// Create toast notification
function createToast(title, message, type = 'info') {
    // Vérifier si le conteneur de toasts existe, sinon le créer
    let toastContainer = document.getElementById('toastContainer');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    
    // Limiter le nombre de toasts à 4 en même temps
    const existingToasts = toastContainer.querySelectorAll('.toast');
    if (existingToasts.length >= 4) {
        // Supprimer le toast le plus ancien
        existingToasts[0].remove();
    }
    
    // Créer un ID unique pour ce toast
    const toastId = 'toast-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    
    // Obtenir la couleur en fonction du type
    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-check-circle';
    else if (type === 'error') iconClass = 'fa-exclamation-circle';
    else if (type === 'warning') iconClass = 'fa-exclamation-triangle';
    
    // Créer l'élément toast avec une animation améliorée
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.id = toastId;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas ${iconClass}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
            <div class="toast-progress">
                <div class="toast-progress-bar"></div>
            </div>
        </div>
        <button class="toast-close" aria-label="Close notification">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Ajouter le toast au conteneur
    toastContainer.appendChild(toast);
    
    // Afficher avec une animation d'entrée
    requestAnimationFrame(() => {
        toast.classList.add('show');
        
        // Animer la barre de progression
        const progressBar = toast.querySelector('.toast-progress-bar');
        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.style.transition = 'width 5s linear';
            setTimeout(() => {
                progressBar.style.width = '0%';
            }, 100);
        }
    });
    
    // Ajouter les écouteurs d'événements
    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeToast(toast);
        });
    }
    
    // Fermer automatiquement après 5 secondes
    const autoCloseTimeout = setTimeout(() => {
        closeToast(toast);
    }, 5000);
    
    // Pause le compte à rebours si le toast est survolé
    toast.addEventListener('mouseenter', () => {
        clearTimeout(autoCloseTimeout);
        // Mettre en pause l'animation de la barre de progression
        const progressBar = toast.querySelector('.toast-progress-bar');
        if (progressBar) {
            progressBar.style.transition = 'none';
        }
    });
    
    // Reprendre le compte à rebours quand la souris quitte
    toast.addEventListener('mouseleave', () => {
        // Calculer le temps restant et relancer l'animation
        const progressBar = toast.querySelector('.toast-progress-bar');
        if (progressBar) {
            // Relancer l'animation pour 5 secondes
            progressBar.style.transition = 'width 5s linear';
            progressBar.style.width = '0%';
            
            // Et remettre le timeout
            setTimeout(() => {
                closeToast(toast);
            }, 5000);
        }
    });
    
    return toastId;
}

// Fonction pour fermer un toast avec animation
function closeToast(toast) {
    if (!toast) return;
    
    // Ajouter une classe pour l'animation de sortie
    toast.classList.add('hiding');
    
    // Supprimer après la fin de l'animation
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

// Helper functions
function formatTime(timeString) {
    if (!timeString) return '';
    
    const date = new Date(timeString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(timeString) {
    if (!timeString) return '';
    
    const date = new Date(timeString);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatAction(action) {
    if (!action) return '';
    
    if (action.includes('ouverture_long')) return 'Open Long';
    if (action.includes('ouverture_short')) return 'Open Short';
    if (action.includes('fermeture_long')) return 'Close Long';
    if (action.includes('fermeture_short')) return 'Close Short';
    
    return action;
}

function getDirectionFromAction(action) {
    if (!action) return '';
    
    if (action.includes('long')) return 'Long';
    if (action.includes('short')) return 'Short';
    
    return '';
}

function getTrendClass(trend) {
    if (!trend) return '';
    
    if (trend.toLowerCase() === 'haussière') return 'profit-positive';
    if (trend.toLowerCase() === 'baissière') return 'profit-negative';
    
    return '';
}

function getAlignmentClass(alignment) {
    if (typeof alignment !== 'number') return '';
    
    if (alignment > 0) return 'profit-positive';
    if (alignment < 0) return 'profit-negative';
    
    return '';
}

// Initialiser et mettre à jour les badges
function updateBadges(data) {
    const tradesCountBadge = document.getElementById('tradesCountBadge');
    
    if (tradesCountBadge) {
        if (data && data.recent_trades && data.recent_trades.length > 0) {
            // Afficher le nombre de trades récents
            tradesCountBadge.textContent = data.recent_trades.length;
            tradesCountBadge.style.display = 'inline-flex';
        } else {
            // Masquer le badge s'il n'y a pas de trades récents
            tradesCountBadge.style.display = 'none';
        }
    }
} 