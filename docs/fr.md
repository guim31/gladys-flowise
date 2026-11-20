# Flowise

[Flowise](https://flowiseai.com) construit des chatflows et des agents d'IA en reliant des blocs :
un modèle (OpenAI, Mistral, Ollama…), une mémoire, des documents, des outils. Cette intégration
permet à vos scènes Gladys d'envoyer une question à un de ces flux, avec les informations de la
scène dans la question, et d'utiliser sa réponse dans les actions suivantes : l'envoyer par
message, la faire lire à voix haute, la tester dans une condition.

Elle suit aussi le serveur (en ligne ou non, nombre de flux), garde la dernière réponse sur un
appareil, et propose un widget de tableau de bord et deux déclencheurs de scène.

## Ce qu'il faut

- Gladys 5.1 ou plus récent.
- Un serveur Flowise sur votre réseau (port 3000 par défaut), avec au moins un chatflow ou un
  agentflow.
- Une clé d'API Flowise, facultative mais conseillée : créez-la dans Flowise, menu **API Keys**.
  Elle permet de lister vos flux (une scène peut alors nommer un flux par son nom) et d'utiliser
  les flux protégés par une clé.

## Mise en place

1. Dans Gladys, ouvrez **Intégrations**, cherchez **Flowise** et installez-la.
2. Dans **Configuration**, renseignez :
   - **Adresse** : l'adresse IP ou le nom du serveur, ex. `192.168.1.20` (le port 3000 est
     ajouté), `192.168.1.20:8080`, ou l'URL complète d'un proxy inverse ; une adresse copiée
     depuis le navigateur convient aussi ;
   - **Clé d'API (facultative)** : la clé créée dans Flowise ;
   - **Flux par défaut** : le flux utilisé quand une action de scène n'en nomme aucun ;
   - **Attente maximale d'une réponse** : de 30 à 110 secondes (60 par défaut) ;
   - **Intervalle de rafraîchissement** : fréquence de lecture de l'état du serveur (une minute
     par défaut) ;
   - **Langue des noms de fonctionnalités** : les noms donnés aux fonctionnalités et les textes
     des événements de scène et des erreurs.
3. Enregistrez, puis appuyez sur **Tester la connexion** : elle affiche la version de Flowise et,
   avec une clé, la liste de vos flux.
4. Dans l'onglet **Découverte**, ajoutez l'appareil **Flowise** à Gladys.

Un flux se désigne par son identifiant (la suite de chiffres et de lettres à la fin de l'adresse
du flux dans Flowise, ex. `b4aa0269-51dd-45e4-8121-569626ad0539`), par l'adresse complète copiée
depuis le navigateur, ou par son nom quand une clé d'API est renseignée.

## L'appareil Flowise

| Fonctionnalité     | Signification                                                      |
| ------------------ | ------------------------------------------------------------------ |
| `En ligne`         | 1 quand le serveur répond, 0 après deux lectures en échec de suite |
| `Flux`             | nombre de chatflows et d'agentflows (seulement avec une clé d'API) |
| `Dernière réponse` | début de la dernière réponse reçue par une scène (500 caractères)  |

Ajouter la clé d'API plus tard fait proposer **Mettre à jour** dans l'onglet Découverte, pour
ajouter la fonctionnalité `Flux`.

## Tableau de bord

Le widget **Flowise** affiche le serveur (en ligne, version), le nombre de flux (avec une clé),
le flux et l'heure de la dernière réponse, et le début de cette réponse. Le réglage **Afficher la dernière réponse** masque le texte de la réponse.

## Scènes

### Déclencheurs

- **Flowise est hors ligne** : le serveur ne répond plus (deux lectures en échec de suite, à
  15 secondes d'écart). Variable : la raison.
- **Flowise est de retour** : le serveur répond de nouveau. Variable : la durée de la panne, en
  minutes.

### Actions

- **Demander à Flowise** : envoie une question à un flux.
  - **Question** : tapez `{{` pour insérer des informations de la scène, ex. la température
    d'un capteur ou une valeur du déclencheur ;
  - **Flux** : vide pour le flux par défaut ; sinon son identifiant, son adresse ou son nom ;
  - **Conversation** : le même nom d'une exécution à l'autre (ex. `cuisine`) garde la mémoire
    du flux, si le flux a une mémoire ; vide, chaque exécution est une nouvelle conversation ;
  - **Réponse la plus longue** : en caractères (1000 par défaut, 10 000 au plus). Une réponse
    plus longue est coupée à la fin d'une phrase (ou d'un mot), marquée par `…`.

  Ses résultats sont disponibles pour les actions suivantes : **Réponse**, **Flux utilisé**,
  **Identifiant de conversation**, **Temps de réponse** (secondes) et **Réponse coupée**
  (oui/non). Dans une action **Envoyer un message**, tapez `{{` et choisissez **Réponse**. Un
  échec (serveur injoignable, flux introuvable, clé refusée, flux en erreur) s'affiche en rouge
  avec sa raison.

### Idées de scènes

- **Briefing du matin** : à 7 h, **Demander à Flowise** « Résume la journée : température
  extérieure `{{…}}`, agenda `{{…}}`. » à un agent qui connaît vos habitudes, puis envoyez la
  **Réponse** sur votre téléphone.
- **Assistant de la cuisine** : avec la conversation `cuisine`, chaque question garde le fil
  des précédentes.
- **Surveiller le serveur** : sur **Flowise est hors ligne**, envoyez-vous un message avec la
  raison.

## Dépannage

- **« Flowise ne répond pas »** : vérifiez l'adresse et le port (3000), et que le serveur est
  démarré. Avec Docker, le port doit être publié.
- **« flux introuvable »** : copiez l'identifiant depuis la barre d'adresse de Flowise, ou
  utilisez **Tester la connexion** pour voir les noms exacts.
- **« accès refusé »** : la clé d'API est fausse, ou le flux est protégé par une autre clé.
- **« le flux a échoué dans Flowise »** : un bloc du flux a échoué (modèle injoignable,
  identifiants manquants…) ; ouvrez le flux et ses **Executions** dans Flowise.
- **« Flowise a mis trop de temps à répondre »** : augmentez l'attente maximale, ou simplifiez
  le flux.
- Problèmes et idées : [tickets GitHub](https://github.com/guim31/gladys-flowise/issues).

## Limites

- Texte seulement : pas d'image ni de fichier dans la question, pas de réponse en flux continu.
- Gladys attend une action deux minutes au plus. La réponse est limitée à 10 000 caractères.
- Les variables de Flowise (`$vars`) ne sont pas transmises : mettez les informations de la
  scène dans la question.
- Langflow n'est pas pris en charge : son API et ses identifiants sont différents.
- Les questions et les réponses ne vont jamais dans les logs de l'intégration.
- Testée contre un vrai Flowise 3.1.2 (agentflow sans modèle), sans instance Gladys réelle :
  retours bienvenus.
- Sans lien avec FlowiseAI.
