# Claude Code cloud et suivi d’usage

Le bureau propose deux exécutions distinctes : le serveur local avec Claude Code et ses MCP, et un bureau hébergé privé qui délègue les missions à Claude Code cloud. La fermeture du PC n’affecte pas une mission déjà envoyée depuis le bureau hébergé. La version locale reste disponible.

## Compte et hébergement

Il faut un compte Claude donnant accès à Claude Code cloud, une connexion GitHub au dépôt et un hébergement du bureau accessible en HTTPS. Le déploiement fourni utilise Sites pour le site privé, Cloudflare Workers pour l’API et D1 pour les agents, les missions, les livrables et le suivi d’usage. Il n’exécute aucun binaire Claude Code sur Workers.

Le projet ne nécessite pas de clé API Claude Console. Il utilise le jeton d’un déclencheur de tâche cloud, généré dans le compte Claude. Cette exécution consomme les quotas de l’abonnement. L’accès à l’hébergement et ses limites restent ceux du service utilisé.

Le site est privé et protégé par la connexion ChatGPT de son propriétaire. La connexion au site et la connexion Claude sont distinctes. Les historiques locaux et ceux du site sont séparés ; les anciennes missions locales ne sont pas automatiquement transférées.

## Configurer une tâche dans Claude

1. Ouvrir [les tâches Claude Code](https://claude.ai/code/routines) avec le bon espace du compte.
2. Créer une tâche **Atelier — Nora et son équipe**, sélectionner ce dépôt et choisir un déclencheur **API uniquement**. Aucune planification quotidienne n’est nécessaire.
3. Copier les instructions proposées dans les réglages du bureau hébergé. Sans contexte `ATELIER_RUN`, la tâche doit s’arrêter.
4. Retirer les connecteurs du brouillon de cette tâche. Les missions cloud de cette version sont textuelles ; les autorisations locales ne sont pas reproduites.
5. Utiliser un environnement dédié avec accès réseau limité au domaine HTTPS du bureau, à `api.anthropic.com` et aux gestionnaires de paquets nécessaires. Ne pas ouvrir tout le réseau pour contourner une erreur.
6. Configurer le script de démarrage du dépôt :

```bash
#!/bin/bash
set -e
npm ci --ignore-scripts --no-audit --no-fund
```

7. Enregistrer la tâche et copier son **URL Fire** et son **jeton**. Le jeton n’est affiché qu’une fois ; un remplacement invalide l’ancien.
8. Dans le bureau hébergé, ouvrir **Réglages → Claude Code cloud**, saisir ces deux valeurs et enregistrer. Le jeton est chiffré côté serveur. Il n’est jamais renvoyé au navigateur.
9. Envoyer une petite mission textuelle et vérifier son livrable ainsi que le lien **Suivre dans Claude** dans les missions.

L’URL Fire doit avoir la forme officielle `https://api.anthropic.com/v1/claude_code/routines/trig_…/fire`. Une URL différente ou une clé API classique est refusée. La configuration enregistrée ne garantit pas à elle seule que le compte autorise le déclenchement : le premier lancement le confirme.

## Retour des résultats

Le déclencheur officiel renvoie seulement l’identifiant et le lien de la session. Il ne fournit ni flux de sortie ni accès de lecture des résultats. Le studio transmet donc un contexte de retour à usage limité à la mission.

La tâche cloud utilise `scripts/cloud-report.mjs` pour envoyer, dans l’ordre :

1. Un plan structuré : le serveur valide les recrutements et renvoie les identifiants réels.
2. Les contributions des spécialistes affectés.
3. La synthèse finale, ou un message d’erreur.

Chaque événement porte un identifiant pour dédupliquer ses tentatives. Le serveur contrôle le jeton de la mission, l’expiration, les participants, les capacités et les étapes déjà reçues. Un plan invalide ne crée aucun agent. Une synthèse n’est acceptée qu’après réception du plan et de toutes les contributions.

Les événements reçus en HTTPS mettent à jour D1. Les écritures utilisent une version attendue pour éviter les mises à jour perdues. Quand une mission se termine, le serveur peut déclencher la suivante sans navigateur ouvert. La file est limitée à dix missions, traitées successivement.

Si l’appel initial est interrompu, une session peut déjà avoir été créée. Le studio marque la situation **incertaine** et ne renvoie pas automatiquement la mission. Vérifier la session dans Claude avant toute nouvelle demande : chaque nouvel appel Fire crée une nouvelle session.

Le retour reste dépendant du comportement du modèle, de ses permissions et du réseau. Une session qui attend une intervention dans Claude ne devient pas terminée dans le bureau par simple écoulement du temps. Les jetons de retour expirent après 48 heures.

## Consommation et limites

Ouvrir **Consommation** dans la barre latérale.

### Limites de l’abonnement

Les cartes affichent le pourcentage utilisé et restant pour les **cinq heures** et la **semaine**, ainsi que la date de réinitialisation communiquée par Claude. Ces données concernent le compte, y compris ses autres usages, et ne sont pas calculées à partir des tokens du studio.

La version locale lit les limites avec le contrôle expérimental `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET` du SDK officiel. La session d’observation ne soumet aucun prompt au modèle, ne charge aucun outil MCP et évite le scan des historiques locaux. Le serveur limite la fréquence de cette lecture.

Dans le cloud, le script tente une lecture officielle lors du retour final. Le panneau peut aussi présenter un relevé initial effectué lors de la configuration. Il affiche toujours sa date. **Un relevé expiré ou indisponible n’est pas remplacé par un zéro.** Le jeton de routine ne donne aucun accès à l’usage du compte. L’interface propose le lien vers [le tableau officiel Claude](https://claude.ai/settings/usage).

Ce point de lecture du SDK est expérimental et peut changer. Si l’environnement cloud ne peut pas l’utiliser, la mission peut se terminer normalement tandis que les limites restent indisponibles ou anciennes.

### Tokens du bureau

Les quatre compteurs distinguent entrée, sortie, cache lu et cache écrit. Les résumés des cinq dernières heures et des sept derniers jours comptent les tokens d’entrée et de sortie enregistrés pendant ces périodes.

- En local, le studio utilise les résultats `modelUsage` de Claude Code/du SDK lorsqu’ils existent, avec le champ `usage` comme repli. Les résultats cumulatifs d’une même session remplacent leurs valeurs précédentes.
- Dans une session cloud, le script peut additionner les usages des messages de la transcription du dépôt dans sa machine isolée. Les doublons d’un même message sont remplacés.
- Ce relevé cloud est **partiel** : il peut exclure les sous-agents et la dernière réponse, qui n’existe pas encore lorsque le script est exécuté.
- Aucun historique antérieur à cette fonctionnalité ni usage d’une autre application n’est ajouté aux compteurs du bureau.
- Zéro signifie aucun token enregistré dans ce périmètre. Le studio ne connaît pas un nombre fixe de tokens « inclus » dans l’abonnement et n’en invente pas.

## Développement et sécurité

Le protocole portable est dans `server/cloud-core.js`, le calcul d’usage dans `server/usage.js` et l’observation du compte dans `server/usage-reader.js`. Le script `scripts/sync-cloud-site.mjs` copie l’interface et le protocole vers le checkout du site géré séparément.

Le site possède sa propre source privée gérée par Sites. Les dépendances et builds locaux, les secrets, les contextes `.atelier-*.json` et le checkout `cloud-site/` sont exclus du dépôt public. Le protocole cloud et son script de retour restent dans ce dépôt afin que Claude puisse les exécuter.

Le serveur hébergé attend les valeurs de runtime suivantes, configurées comme secrets lorsque nécessaire :

| Variable | Rôle |
| --- | --- |
| `CLOUD_VAULT_KEY` | Clé de chiffrement AES-GCM du jeton de routine ; conserver la même clé entre les déploiements |
| `SITES_SERVICE_TOKEN` | Accès serveur à serveur au site privé ; jamais livré au navigateur |
| `ATELIER_PUBLIC_URL` | Origine HTTPS du bureau |
| `ATELIER_INITIAL_LIMITS` | Relevé initial facultatif ; sa date reste visible |

Ne pas placer ces secrets dans un prompt de tâche permanent, Git, une capture ou le bundle client. Le contexte temporaire d’une mission transmet à Claude uniquement les accès de retour nécessaires ; le script masque leurs valeurs dans les événements et supprime le fichier de contexte après une fin réussie.

Les droits d’accès réseau et connecteurs se gèrent dans Claude. Le protocole ne remplace pas les permissions natives de Claude Code. Il ne fournit pas encore un mécanisme de validation des outils externes équivalent au mode local, d’où la configuration cloud sans connecteurs externes.

## Vérifier

```text
npm test
npm run build
```

Les tests cloud utilisent une routine et un stockage factices : ils vérifient chiffrement, domaine du déclencheur, absence de secrets dans l’état public, déduplication, événements dans l’ordre, écritures concurrentes, retours expirés et absence de renvoi automatique après une réponse incertaine. Aucun appel au modèle n’est nécessaire pour ces tests.

Références : [déclenchement officiel d’une routine](https://platform.claude.com/docs/en/api/claude-code/routines-fire), [tâches cloud](https://code.claude.com/docs/en/routines), [données d’usage de Claude Code](https://code.claude.com/docs/en/statusline).
